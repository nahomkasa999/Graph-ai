import { Graph, SpanEvent, Stats, Trace, TraceComplete } from "@flowlens/core";
import { useEffect } from "react";
import { create } from "zustand";

type Connection = "connecting" | "connected" | "disconnected";
type LiveState = {
  graph?: Graph;
  graphFailed: boolean;
  connection: Connection;
  stats: Stats;
  traces: Trace[];
  selectedTrace: string | null;
  pulses: Record<string, number>;
  replaying: boolean;
};

export const useLive = create<LiveState>(() => ({
  graphFailed: false,
  connection: "connecting",
  stats: {},
  traces: [],
  selectedTrace: null,
  pulses: {},
  replaying: false,
}));

let pulseSequence = 0;
const pulseTimers = new Map<string, number>();
let replayTimers: number[] = [];

function pulseSpan(span: SpanEvent) {
  const ids = [span.nodeId, span.stepId].filter(
    (id): id is string => id !== null,
  );
  if (!ids.length) return;
  const sequence = ++pulseSequence;
  useLive.setState(({ pulses }) => ({
    pulses: {
      ...pulses,
      ...Object.fromEntries(ids.map((id) => [id, sequence])),
    },
  }));
  for (const id of ids) {
    window.clearTimeout(pulseTimers.get(id));
    pulseTimers.set(
      id,
      window.setTimeout(() => {
        pulseTimers.delete(id);
        useLive.setState(({ pulses }) => {
          if (pulses[id] !== sequence) return { pulses };
          const next = { ...pulses };
          delete next[id];
          return { pulses: next };
        });
      }, 600),
    );
  }
}

export function replayTrace(trace: Trace) {
  for (const timer of replayTimers) window.clearTimeout(timer);
  for (const timer of pulseTimers.values()) window.clearTimeout(timer);
  pulseTimers.clear();
  replayTimers = [];
  const ordered = [...trace.spans].sort(
    (left, right) => left.startMs - right.startMs,
  );
  useLive.setState({
    selectedTrace: trace.traceId,
    replaying: ordered.length > 0,
    pulses: {},
  });
  const start = ordered[0]?.startMs;
  if (start === undefined) return;
  const end = ordered.at(-1)?.startMs ?? start;
  const elapsed = end - start;
  const scale = elapsed > 5000 ? 5000 / elapsed : 1;
  replayTimers = ordered.map((span) =>
    window.setTimeout(() => pulseSpan(span), (span.startMs - start) * scale),
  );
  replayTimers.push(
    window.setTimeout(
      () => {
        replayTimers = [];
        useLive.setState({ replaying: false });
      },
      elapsed * scale + 600,
    ),
  );
}

type Schema<T> = { parse: (value: unknown) => T };

async function get<T>(path: string, schema: Schema<T>, signal: AbortSignal) {
  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw Error(`Failed to load ${path}`);
  return schema.parse(await response.json());
}

function eventData<T>(
  source: EventSource,
  name: string,
  schema: Schema<T>,
  receive: (data: T) => void,
) {
  source.addEventListener(name, (event: MessageEvent<string>) => {
    try {
      receive(schema.parse(JSON.parse(event.data)));
    } catch {}
  });
}

const oldestFirst = (left: SpanEvent, right: SpanEvent) =>
  left.startMs - right.startMs;
const newestTraceFirst = (left: Trace, right: Trace) =>
  (right.spans[0]?.startMs ?? 0) - (left.spans[0]?.startMs ?? 0);

export function useLiveConnection() {
  useEffect(() => {
    const abort = new AbortController();
    const pending = new Map<string, Map<string, SpanEvent>>();
    let events: EventSource | undefined;
    let retry: number | undefined;
    let delay = 400;
    let graphRequest = 0;
    let statsUpdates = 0;

    function loadGraph() {
      const request = ++graphRequest;
      void get("/api/graph", Graph, abort.signal)
        .then((graph) => {
          if (request === graphRequest)
            useLive.setState({ graph, graphFailed: false });
        })
        .catch(() => {
          if (!abort.signal.aborted && request === graphRequest)
            useLive.setState({ graphFailed: true });
        });
    }

    function receiveSpan(span: SpanEvent) {
      const traces = useLive.getState().traces;
      if (traces.some(({ traceId }) => traceId === span.traceId)) {
        useLive.setState({
          traces: traces.map((trace) =>
            trace.traceId === span.traceId
              ? {
                  ...trace,
                  spans: [
                    ...trace.spans.filter(
                      ({ spanId }) => spanId !== span.spanId,
                    ),
                    span,
                  ].sort(oldestFirst),
                }
              : trace,
          ),
        });
      } else {
        const spans = pending.get(span.traceId) ?? new Map();
        spans.set(span.spanId, span);
        pending.set(span.traceId, spans);
        if (pending.size > 200) {
          const first = pending.keys().next().value;
          if (first !== undefined) pending.delete(first);
        }
      }
      if (!useLive.getState().replaying) pulseSpan(span);
    }

    function complete(trace: TraceComplete) {
      const spans = [...(pending.get(trace.traceId)?.values() ?? [])].sort(
        oldestFirst,
      );
      pending.delete(trace.traceId);
      useLive.setState(({ traces }) => ({
        traces: [
          {
            ...trace,
            spans: spans.length
              ? spans
              : (traces.find(({ traceId }) => traceId === trace.traceId)
                  ?.spans ?? []),
          },
          ...traces.filter(({ traceId }) => traceId !== trace.traceId),
        ].slice(0, 20),
      }));
    }

    function connect() {
      const source = new EventSource("/api/stream");
      events = source;
      source.onopen = () => {
        delay = 400;
        useLive.setState({ connection: "connected" });
        loadGraph();
        void get("/api/traces", Trace.array(), abort.signal)
          .then((saved) => {
            useLive.setState(({ traces }) => {
              const merged = new Map(
                saved.map((trace) => [trace.traceId, trace]),
              );
              for (const trace of traces) {
                const previous = merged.get(trace.traceId);
                if (!previous || trace.spans.length >= previous.spans.length)
                  merged.set(trace.traceId, trace);
              }
              return {
                traces: [...merged.values()]
                  .sort(newestTraceFirst)
                  .slice(0, 20),
              };
            });
          })
          .catch(() => {});
        const before = statsUpdates;
        void get("/api/stats", Stats, abort.signal)
          .then((stats) => {
            if (before === statsUpdates) useLive.setState({ stats });
          })
          .catch(() => {});
      };
      source.onerror = () => {
        source.close();
        useLive.setState({ connection: "disconnected" });
        if (!abort.signal.aborted) {
          retry = window.setTimeout(connect, delay);
          delay = Math.min(delay * 2, 8000);
        }
      };
      source.addEventListener("graph-updated", loadGraph);
      eventData(source, "span", SpanEvent, receiveSpan);
      eventData(source, "trace-complete", TraceComplete, complete);
      eventData(source, "stats", Stats, (stats) => {
        statsUpdates++;
        useLive.setState({ stats });
      });
    }

    loadGraph();
    connect();
    return () => {
      abort.abort();
      events?.close();
      window.clearTimeout(retry);
    };
  }, []);
}

export function formatMs(value: number) {
  if (value > 0 && value < 0.01) return "<0.01 ms";
  return `${value.toFixed(value >= 100 ? 1 : 2)} ms`;
}
