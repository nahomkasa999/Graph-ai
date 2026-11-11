import type {
  Graph,
  SpanEvent,
  Stats,
  Trace,
  TraceComplete,
} from "@flowlens/core";
import { makeMapper } from "./mapping";
import type { RawSpan } from "./otlp";

export type ServerEvent =
  | { event: "span"; data: SpanEvent }
  | { event: "trace-complete"; data: TraceComplete }
  | { event: "stats"; data: Stats }
  | { event: "graph-updated"; data: null };

type Sample = Pick<SpanEvent, "status" | "durationMs">;
type ActiveTrace = {
  raw: Map<string, RawSpan>;
  mapped: Map<string, SpanEvent>;
  mapper: ReturnType<typeof makeMapper>;
};

export function summarize(samples: Sample[]) {
  const times = samples
    .map((span) => span.durationMs)
    .sort((left, right) => left - right);
  const percentile = (p: number) => times[Math.ceil(times.length * p) - 1] ?? 0;
  return {
    count: samples.length,
    errorCount: samples.filter((span) => span.status === "error").length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    lastMs: samples.at(-1)?.durationMs ?? 0,
  };
}

export function makeTraceStore(initial: Graph) {
  let graph = initial;
  let mapper = makeMapper(graph);
  const active = new Map<string, ActiveTrace>();
  const completed = new Map<string, Trace>();
  const windows = new Map<string, (Sample & { key: string })[]>();
  const listeners = new Set<(event: ServerEvent) => void>();
  let statsTimer: ReturnType<typeof setTimeout> | undefined;
  const emit = (event: ServerEvent) => {
    for (const listener of listeners) listener(event);
  };
  const stats = (): Stats =>
    Object.fromEntries(
      [...windows].map(([id, window]) => [id, summarize(window)]),
    );

  const sampleKey = (event: SpanEvent) =>
    JSON.stringify([event.traceId, event.spanId]);

  function scheduleStats() {
    statsTimer ??= setTimeout(() => {
      statsTimer = undefined;
      emit({ event: "stats", data: stats() });
    }, 200).unref();
  }

  function addSample(id: string, event: SpanEvent) {
    const samples = windows.get(id) ?? [];
    samples.push({
      key: sampleKey(event),
      durationMs: event.durationMs,
      status: event.status,
    });
    if (samples.length > 100) samples.shift();
    windows.set(id, samples);
    scheduleStats();
  }

  function removeSample(id: string, event: SpanEvent) {
    const samples = windows.get(id);
    if (!samples) return;
    const key = sampleKey(event);
    const remaining = samples.filter((sample) => sample.key !== key);
    if (remaining.length === samples.length) return;
    if (remaining.length) windows.set(id, remaining);
    else windows.delete(id);
    scheduleStats();
  }

  function ingest(spans: RawSpan[]) {
    const changed = new Set<string>();
    for (const span of spans) {
      const state = active.get(span.traceId) ?? {
        raw: new Map(),
        mapped: new Map(),
        mapper,
      };
      if (state.raw.has(span.spanId)) continue;
      state.raw.set(span.spanId, span);
      active.set(span.traceId, state);
      changed.add(span.traceId);
    }
    for (const id of changed) {
      const state = active.get(id);
      if (!state) continue;
      const events = state.mapper.map(state.raw.values());
      for (const event of events) {
        const previous = state.mapped.get(event.spanId);
        if (previous?.stepId && previous.stepId !== event.stepId)
          removeSample(previous.stepId, event);
      }
      for (const event of events) {
        const previous = state.mapped.get(event.spanId);
        state.mapped.set(event.spanId, event);
        if (event.nodeId && previous?.nodeId !== event.nodeId)
          addSample(event.nodeId, event);
        if (event.stepId && previous?.stepId !== event.stepId)
          addSample(event.stepId, event);
        if (
          !previous ||
          previous.featureId !== event.featureId ||
          previous.stepId !== event.stepId
        )
          emit({ event: "span", data: event });
      }
      const root = events.find((span) => span.parentSpanId === null);
      if (!root) continue;
      const result = {
        traceId: id,
        featureId: root.featureId,
        durationMs: root.durationMs,
      };
      const first = !completed.has(id);
      completed.set(id, { ...result, spans: events });
      if (first) emit({ event: "trace-complete", data: result });
    }
    while (completed.size > 200) {
      const oldest = completed.keys().next().value;
      if (oldest === undefined) break;
      completed.delete(oldest);
      active.delete(oldest);
    }
    while (active.size > 400) {
      const pending = [...active.keys()].find((id) => !completed.has(id));
      if (pending === undefined) break;
      active.delete(pending);
    }
  }

  return {
    ingest,
    stats,
    graph: () => graph,
    traces: () => [...completed.values()].reverse(),
    subscribe(listener: (event: ServerEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replaceGraph(next: Graph) {
      graph = next;
      mapper = makeMapper(graph);
      const ids = new Set(graph.nodes.map((node) => node.id));
      for (const id of windows.keys()) if (!ids.has(id)) windows.delete(id);
      emit({ event: "graph-updated", data: null });
    },
    close() {
      clearTimeout(statsTimer);
      listeners.clear();
    },
  };
}
