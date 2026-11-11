import type { Graph, Trace } from "@flowlens/core";
import { formatMs, useLive } from "./live";

export function TracePanel({
  graph,
  onTrace,
}: {
  graph: Graph;
  onTrace: (trace: Trace) => void;
}) {
  const traces = useLive((state) => state.traces);
  const selectedId = useLive((state) => state.selectedTrace);
  const replaying = useLive((state) => state.replaying);
  const selected = traces.find(({ traceId }) => traceId === selectedId);
  const unmapped = selected?.spans.filter((span) => !span.nodeId) ?? [];
  const command =
    document.body.dataset.startCommand ??
    "node --import @flowlens/tracer/register src/index.ts";
  return (
    <section className="trace-panel" aria-label="Recent traces">
      <div className="trace-heading">
        <h2>Recent traces</h2>
        {replaying && (
          <span className="trace-playing" role="status">
            Replaying trace
          </span>
        )}
      </div>
      {!traces.length && (
        <>
          <p className="muted">
            Start your app with tracing to see requests here.
          </p>
          <code>{command}</code>
        </>
      )}
      {!!traces.length && (
        <div className="trace-rows">
          {traces.map((trace) => {
            const feature = graph.nodes.find(
              ({ id }) => id === trace.featureId,
            );
            const failed = trace.spans.some(({ status }) => status === "error");
            return (
              <button
                className="trace-row"
                type="button"
                key={trace.traceId}
                onClick={() => onTrace(trace)}
                aria-pressed={trace.traceId === selectedId}
              >
                <span className={failed ? "trace-error" : "trace-ok"}>
                  {failed ? "Error" : "OK"}
                </span>
                <span>
                  {feature?.label ?? trace.spans[0]?.name ?? "Unmapped trace"}
                </span>
                <code>{formatMs(trace.durationMs)}</code>
              </button>
            );
          })}
        </div>
      )}
      {!!unmapped.length && (
        <div className="unmapped">
          <h3>Unmapped spans</h3>
          <ul>
            {unmapped.map((span) => (
              <li key={span.spanId}>
                <span>{span.name}</span>
                <code>{formatMs(span.durationMs)}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
