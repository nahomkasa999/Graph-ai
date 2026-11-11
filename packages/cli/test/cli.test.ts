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
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    const readPort = () =>
      /Flowlens at http:\/\/127\.0\.0\.1:(\d+)/.exec(output)?.[1];
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
    expect(output).toContain("node --import");
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
