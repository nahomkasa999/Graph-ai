import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { analyze } from "../packages/analyzer/dist/index.js";
import { Trace, TraceComplete } from "../packages/core/dist/index.js";
import { serveFlowlens } from "../packages/server/dist/index.js";

const demo = fileURLToPath(new URL("../examples/notes-app/", import.meta.url));

function getPort(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(Error(`Notes did not start: ${output}`)),
      6000,
    );
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const port = /Notes API listening at http:\/\/127\.0\.0\.1:(\d+)/.exec(
        output,
      )?.[1];
      if (port) {
        clearTimeout(timer);
        resolve(Number(port));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Notes exited with ${code}: ${output}`));
    });
  });
}

async function firstComplete(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  const reader = response.body
    ?.pipeThrough(new TextDecoderStream())
    .getReader();
  if (!reader) throw Error("SSE response has no body");
  return async () => {
    let buffer = "";
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        buffer += item.value;
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const payload = /^data: (.+)$/m.exec(frame)?.[1];
          if (payload && frame.includes("event: trace-complete")) {
            return {
              event: TraceComplete.parse(JSON.parse(payload)),
              at: performance.now(),
            };
          }
        }
      }
      throw Error("SSE stream closed before the trace completed");
    } finally {
      await reader.cancel().catch(() => {});
    }
  };
}

test("a real notes request streams six mapped function steps in under 500 ms", async () => {
  const temp = await mkdtemp(join(tmpdir(), "flowlens-e2e-"));
  const controller = new AbortController();
  let server: Awaited<ReturnType<typeof serveFlowlens>> | undefined;
  let child: ChildProcess | undefined;
  try {
    await analyze(demo);
    server = await serveFlowlens(demo, { port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    child = spawn(
      process.execPath,
      ["--import", "@nazs/flowlens-tracer/register", "src/index.ts"],
      {
        cwd: demo,
        env: {
          ...process.env,
          FLOWLENS_DISABLE: "0",
          OTEL_TRACES_SAMPLER: "always_off",
          FLOWLENS_ROOT: demo,
          FLOWLENS_URL: `${base}/v1/traces`,
          NOTES_PORT: "0",
          NOTES_DB: join(temp, "notes.sqlite"),
          NOTES_AUDIT: join(temp, "audit.jsonl"),
        },
      },
    );
    const port = await getPort(child);
    const read = await firstComplete(
      `${base}/api/stream`,
      AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    );
    const completed = read();
    void completed.catch(() => {});
    const response = await fetch(`http://127.0.0.1:${port}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Traced note" }),
    });
    await response.text();
    const finished = performance.now();
    expect(response.status).toBe(201);
    const { event, at } = await completed;
    const delay = at - finished;
    expect(event.featureId).toBe("feat:POST /notes");
    expect(delay).toBeLessThan(500);
    const traces = Trace.array().parse(
      await (await fetch(`${base}/api/traces`)).json(),
    );
    const trace = traces.find((entry) => entry.traceId === event.traceId);
    expect(trace?.spans.filter((span) => span.stepId)).toHaveLength(6);
    expect(
      trace?.spans
        .filter((span) => span.stepId)
        .every((span) => span.durationMs >= 0),
    ).toBe(true);
    process.stdout.write(
      `Trace delivery after request completion: ${delay.toFixed(0)} ms\n`,
    );
  } finally {
    controller.abort();
    if (child && child.exitCode === null) {
      const done = new Promise<void>((finish) =>
        child?.once("exit", () => finish()),
      );
      child.kill();
      await done;
    }
    await server?.close();
    await rm(temp, { recursive: true, force: true });
  }
}, 15_000);

test("server shutdown closes a connected event stream", async () => {
  await analyze(demo);
  const server = await serveFlowlens(demo, { port: 0 });
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/stream`, {
      signal: controller.signal,
    });
    const stream = response.text();
    await server.close();
    expect(await stream).toContain(": connected");
  } finally {
    controller.abort();
  }
});
