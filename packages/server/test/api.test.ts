import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Graph } from "@flowlens/core";
import { expect, test } from "vitest";
import { createFlowlensApp } from "../src/index";
import { decodeSpans, OtlpPayload } from "../src/otlp";
import { makeTraceStore, type ServerEvent, summarize } from "../src/traces";

const graph = Graph.parse({
  version: 1,
  generatedAt: "2026-01-01T00:00:00Z",
  root: "/project",
  edges: [],
  nodes: [
    {
      id: "feat:GET /notes/:id",
      kind: "feature",
      level: 1,
      label: "Dynamic",
      parentId: "mod:notes",
      meta: { method: "GET", path: "/notes/:id" },
    },
    {
      id: "feat:GET /notes/recent",
      kind: "feature",
      level: 1,
      label: "Static",
      parentId: "mod:notes",
      meta: { method: "GET", path: "/notes/recent" },
    },
    {
      id: "fn:src/notes.ts#read",
      kind: "function",
      level: 3,
      label: "read",
      parentId: "mod:notes",
    },
    {
      id: "step:one",
      kind: "step",
      level: 2,
      label: "First",
      parentId: "feat:GET /notes/recent",
      meta: { order: 1, functionId: "fn:src/notes.ts#read" },
    },
    {
      id: "step:two",
      kind: "step",
      level: 2,
      label: "Second",
      parentId: "feat:GET /notes/recent",
      meta: { order: 2, functionId: "fn:src/notes.ts#read" },
    },
  ],
});

function raw(
  traceId: string,
  spanId: string,
  parentSpanId: string,
  start: number,
  attributes: Record<string, string> = {},
) {
  return {
    traceId,
    spanId,
    parentSpanId,
    name: spanId,
    kind: parentSpanId ? 1 : 2,
    startTimeUnixNano: String(start * 1_000_000),
    endTimeUnixNano: String((start + 5) * 1_000_000),
    attributes: Object.entries(attributes).map(([key, stringValue]) => ({
      key,
      value: { stringValue },
    })),
  };
}

function decode(...spans: ReturnType<typeof raw>[]) {
  return decodeSpans(
    OtlpPayload.parse({ resourceSpans: [{ scopeSpans: [{ spans }] }] }),
  );
}

test("maps a split batch, prefers static paths and uses each repeated step once", () => {
  const store = makeTraceStore(graph);
  const events: ServerEvent[] = [];
  const unsubscribe = store.subscribe((event) => events.push(event));
  const fn = { "flowlens.node": "fn:src/notes.ts#read" };
  const root = raw("t1", "root", "", 0, {
    "http.request.method": "GET",
    "url.path": "/notes/recent?x=1",
  });
  const children = decode(
    raw("t1", "second", "root", 3, fn),
    raw("t1", "first", "root", 2, fn),
    raw("t1", "unknown", "root", 4),
  );
  try {
    store.ingest(children);
    store.ingest(decode(root));
    store.ingest(decode(root));
    const trace = store.traces()[0];
    expect(trace.featureId).toBe("feat:GET /notes/recent");
    expect(
      trace.spans.map(({ spanId, stepId, nodeId }) => [spanId, stepId, nodeId]),
    ).toEqual([
      ["root", null, "feat:GET /notes/recent"],
      ["first", "step:one", fn["flowlens.node"]],
      ["second", "step:two", fn["flowlens.node"]],
      ["unknown", null, null],
    ]);
    expect(store.stats()[fn["flowlens.node"]].count).toBe(2);
    expect(
      events.filter(({ event }) => event === "trace-complete"),
    ).toHaveLength(1);
    store.ingest(
      decode(
        raw("t2", "root2", "", 0, {
          "http.method": "GET",
          "http.target": "/notes/abc?x=1",
        }),
      ),
    );
    expect(store.traces()[0].featureId).toBe("feat:GET /notes/:id");
  } finally {
    unsubscribe();
    store.close();
  }
});

test("keeps the last 200 traces and last 100 latency samples", () => {
  const store = makeTraceStore(graph);
  try {
    const method = {
      "http.request.method": "GET",
      "url.path": "/notes/recent",
    };
    store.ingest(
      decode(
        ...Array.from({ length: 205 }, (_, i) =>
          raw(`trace-${i}`, "root", "", 0, method),
        ),
      ),
    );
    expect(store.traces()).toHaveLength(200);
    expect(store.traces()[0].traceId).toBe("trace-204");
    expect(store.stats()["feat:GET /notes/recent"]).toEqual({
      count: 100,
      errorCount: 0,
      p50Ms: 5,
      p95Ms: 5,
      lastMs: 5,
    });
    expect(
      summarize([
        { status: "error", durationMs: 2 },
        { status: "ok", durationMs: 20 },
        { status: "ok", durationMs: 5 },
      ]),
    ).toEqual({ count: 3, errorCount: 1, p50Ms: 5, p95Ms: 20, lastMs: 5 });
  } finally {
    store.close();
  }
});

test("returns source ranges and blocks absolute paths, traversal and escaping symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flowlens-source-"));
  const root = join(directory, "project");
  const outside = join(directory, "secret.ts");
  try {
    await mkdir(join(root, ".flowlens"), { recursive: true });
    await writeFile(join(root, ".flowlens/graph.json"), JSON.stringify(graph));
    await writeFile(join(root, "code.ts"), "first\r\nsecond\r\nthird\r\n");
    await writeFile(outside, "private");
    await symlink(outside, join(root, "link.ts"));
    const { app, store } = await createFlowlensApp(root);
    try {
      const query = (file: string) =>
        app.request(
          `/api/source?${new URLSearchParams({ file, start: "2", end: "3" })}`,
        );
      expect(await (await query("code.ts")).json()).toEqual({
        lines: ["second", "third"],
      });
      for (const file of ["../secret.ts", outside, "link.ts"])
        expect((await query(file)).status).toBe(403);
      expect((await query("missing.ts")).status).toBe(404);
      expect(
        (await app.request("/api/source?file=code.ts&start=3&end=1")).status,
      ).toBe(400);
      expect(
        (await app.request("/v1/traces", { method: "POST", body: "{}" }))
          .status,
      ).toBe(415);
      expect(
        (
          await app.request("/v1/traces", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"resourceSpans":1}',
          })
        ).status,
      ).toBe(400);
    } finally {
      store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("moves a prior sample when an earlier span arrives after the root", () => {
  const store = makeTraceStore(graph);
  try {
    const method = {
      "http.request.method": "GET",
      "url.path": "/notes/recent",
    };
    const fn = { "flowlens.node": "fn:src/notes.ts#read" };
    store.ingest(
      decode(
        raw("t3", "root", "", 0, method),
        raw("t3", "later", "root", 4, fn),
      ),
    );
    expect(store.stats()["step:one"].count).toBe(1);
    store.ingest(decode(raw("t3", "earlier", "root", 2, fn)));
    expect(store.stats()["step:one"].count).toBe(1);
    expect(store.stats()["step:two"].count).toBe(1);
  } finally {
    store.close();
  }
});
