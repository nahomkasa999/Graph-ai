import { execFile, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../analyzer/test/fixtures/express-basic/", import.meta.url),
);
const run = (...args: string[]) =>
  promisify(execFile)(process.execPath, [cli, ...args]);

test("initializes without overwriting and analyzes a project through the CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "flowlens CLI "));
  try {
    await cp(fixture, root, { recursive: true });
    expect((await run("init", root)).stdout).toContain("Created");
    const config = join(root, "flowlens.config.json");
    await writeFile(config, '{"modules":{"src/items/**":"stock"}}');
    expect((await run("init", root)).stdout).toContain("Using existing");
    expect((await run("analyze", root)).stdout).toContain("Analyzed");
    expect(
      await readFile(join(root, ".flowlens", "graph.json"), "utf8"),
    ).toContain('"mod:stock"');
    expect(
      await readFile(join(root, ".flowlens", "instrument.json"), "utf8"),
    ).toContain("lookupItem");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dev serves the viewer, prints a valid port and watches source edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "flowlens dev "));
  await cp(fixture, root, { recursive: true });
  const child = spawn(process.execPath, [
    cli,
    "dev",
    root,
    "--port",
    "0",
    "--entry",
    "src/app.ts",
  ]);
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    const readPort = () => /^http:\/\/127\.0\.0\.1:(\d+)\n$/.exec(output)?.[1];
    await expect.poll(readPort, { timeout: 6000 }).toBeTruthy();
    const port = readPort();
    if (!port) throw Error(output);
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(base);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("data-start-command");
    expect(html).toContain(`${base}/v1/traces`);
    expect(html).toContain("node --import");
    expect(output).toBe(`${base}\n`);
    const source = join(root, "src/items/handler.ts");
    await writeFile(
      source,
      `${await readFile(source, "utf8")}\nexport const watched = () => 1;\n`,
    );
    await expect
      .poll(async () => (await fetch(`${base}/api/graph`)).text(), {
        timeout: 5000,
      })
      .toContain("#watched");
    expect(output).toBe(`${base}\n`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise<void>((finish) =>
        child.once("exit", () => finish()),
      );
      child.kill();
      await done;
    }
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);

test("prints guidance for AI agents", async () => {
  const result = await run("--skills");
  expect(result.stdout).toMatch(/^---\nname: flowlens\n/);
  expect(result.stdout).toContain("flowlens dev");
  expect(result.stdout).toContain("/api/graph");
});

test("init configures a traced app and dev keeps its output off stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "flowlens managed "));
  try {
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      join(root, "tsconfig.json"),
      '{"compilerOptions":{"allowJs":true},"include":["index.js"]}',
    );
    await writeFile(
      join(root, "index.js"),
      `
      import { createServer } from "node:http";
      const server = createServer((_request, response) => response.end("pong"));
      server.listen(0, "127.0.0.1", () => {
        process.stdout.write("APP_PORT=" + server.address().port + "\\n");
      });
    `,
    );
    await run("init", root, "--entry", "index.js");
    const child = spawn(process.execPath, [cli, "dev", root, "--port", "0"]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      await expect
        .poll(() => /APP_PORT=\d+/.test(stderr), { timeout: 6000 })
        .toBe(true);
      expect(stdout).toMatch(/^http:\/\/127\.0\.0\.1:\d+\n$/);
      const port = /APP_PORT=(\d+)/.exec(stderr)?.[1];
      const response = await fetch(`http://127.0.0.1:${port}`);
      expect(await response.text()).toBe("pong");
      await expect
        .poll(async () => (await fetch(`${stdout.trim()}/api/traces`)).text())
        .toContain("GET");
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const done = new Promise<void>((finish) =>
          child.once("exit", () => finish()),
        );
        child.kill();
        await done;
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
