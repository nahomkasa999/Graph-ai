import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const Manifest = z.object({
  main: z.string().optional(),
  module: z.string().optional(),
});

export async function entryFor(root: string, explicit?: string) {
  if (explicit) {
    if (!(await stat(resolve(root, explicit))).isFile())
      throw Error(`App entry is not a file: ${explicit}`);
    return explicit;
  }
  let manifest: z.infer<typeof Manifest> = {};
  try {
    manifest = Manifest.parse(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")),
    );
  } catch {}
  const candidates = [
    "src/index.ts",
    "index.ts",
    "src/index.mts",
    "src/index.js",
    "src/server.ts",
    "src/app.ts",
    manifest.module,
    manifest.main,
    "index.js",
    "app.js",
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if ((await stat(resolve(root, candidate))).isFile()) return candidate;
    } catch {}
  }
  return undefined;
}

const preload = import.meta.resolve("@nazs/flowlens-tracer/register");
const collector = (port: number) => `http://127.0.0.1:${port}/v1/traces`;

export function startTracedApp(
  root: string,
  entry: string,
  port: number,
  warn: (error: unknown) => void,
) {
  const child = spawn(
    process.execPath,
    ["--import", preload, resolve(root, entry)],
    {
      cwd: root,
      env: {
        ...process.env,
        FLOWLENS_ROOT: root,
        FLOWLENS_URL: collector(port),
      },
      stdio: ["ignore", 2, 2],
    },
  );
  child.once("error", warn);
  child.once("exit", (code) => {
    if (code) warn(Error(`Traced app exited with code ${code}`));
  });
  return async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      return;
    await new Promise<void>((done) => {
      const deadline = setTimeout(() => child.kill("SIGKILL"), 1500);
      child.once("exit", () => {
        clearTimeout(deadline);
        done();
      });
      child.kill();
    });
  };
}

export function tracedCommand(root: string, entry: string, port: number) {
  const url = collector(port);
  if (process.platform === "win32") {
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    return `Set-Location -LiteralPath ${quote(root)}; $env:FLOWLENS_ROOT=${quote(root)}; $env:FLOWLENS_URL=${quote(url)}; node --import ${quote(preload)} ${quote(entry)}`;
  }
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return `cd ${quote(root)} && FLOWLENS_ROOT=${quote(root)} FLOWLENS_URL=${quote(url)} node --import ${quote(preload)} ${quote(entry)}`;
}
