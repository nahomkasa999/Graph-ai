import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyze } from "../packages/analyzer/dist/index.js";
import { serveFlowlens } from "../packages/server/dist/index.js";

const root = resolve("examples/notes-app");
const temporary = await mkdtemp(join(tmpdir(), "flowlens-browser-"));
await analyze(root);
const server = await serveFlowlens(root, {
  port: Number(process.env.FLOWLENS_TEST_PORT ?? 5401),
  viewerDir: resolve("packages/viewer/dist"),
  startCommand: "pnpm --filter @nazs/flowlens-notes-app start:traced",
});

const notes = spawn(
  process.execPath,
  ["--import", "@nazs/flowlens-tracer/register", "src/index.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      FLOWLENS_ROOT: root,
      FLOWLENS_DISABLE: "0",
      DEMO_LATENCY: "1",
      FLOWLENS_URL: `http://127.0.0.1:${server.port}/v1/traces`,
      NOTES_PORT: process.env.FLOWLENS_TEST_NOTES_PORT ?? "5402",
      NOTES_DB: join(temporary, "notes.sqlite"),
      NOTES_AUDIT: join(temporary, "audit.jsonl"),
    },
  },
);

async function shutdown() {
  if (notes.exitCode === null && notes.signalCode === null) {
    const exited = new Promise<void>((finish) =>
      notes.once("exit", () => finish()),
    );
    notes.kill();
    await exited;
  }
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
