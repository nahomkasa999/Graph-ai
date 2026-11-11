import {
  type Graph,
  type GraphNode,
  SourceResponse,
  type Trace,
} from "@flowlens/core";
import { useEffect, useState } from "react";
import { formatMs, useLive } from "./live";

function highlight(line: string) {
  const tokens =
    /(?:\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:export|function|return|const|let|async|await|import|from|type|new|if|throw|class|default|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;
  const parts = [];
  let end = 0;
  for (const match of line.matchAll(tokens)) {
    const start = match.index ?? 0;
    const value = match[0];
    parts.push(line.slice(end, start));
    const color = value.startsWith("//")
      ? "comment"
      : /^[`"']/.test(value)
        ? "string"
        : /^\d/.test(value)
          ? "number"
          : "keyword";
    parts.push(
      <span key={start} className={`syntax-${color}`}>
        {value}
      </span>,
    );
    end = start + value.length;
  }
  parts.push(line.slice(end));
  return parts;
}

function Source({ node }: { node: GraphNode }) {
  const [source, setSource] = useState<string[]>();
  const [failed, setFailed] = useState(false);
  const { file, range } = node;
  useEffect(() => {
    if (!file || !range) return;
    const abort = new AbortController();
    const params = new URLSearchParams({
      file,
      start: String(range.startLine),
      end: String(range.endLine),
    });
    void fetch(`/api/source?${params}`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Source unavailable");
        return SourceResponse.parse(await response.json()).lines;
      })
      .then(setSource)
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [file, range]);

  if (!range || !file) return null;
  if (!source)
    return (
      <p className="muted">
        {failed ? "Source unavailable" : "Loading source…"}
      </p>
    );
  const lines = source.map((text, index) => ({
    text,
    number: range.startLine + index,
  }));
  return (
    <pre className="source-code">
      <code>
        {lines.map(({ text, number }) => (
          <span key={number} className="source-line">
            <span aria-hidden="true">{number}</span>
            {highlight(text)}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}

const stepColors = [
  "#6256df",
  "#3975ba",
  "#238779",
  "#8866bf",
  "#a56142",
  "#4c778d",
];

function TraceBreakdown({ graph, trace }: { graph: Graph; trace: Trace }) {
  const mapped = trace.spans.flatMap((span) => {
    const step = graph.nodes.find(({ id }) => id === span.stepId);
    return step
      ? [{ id: span.spanId, label: step.label, duration: span.durationMs }]
      : [];
  });
  if (!mapped.length) return null;
  const sum = mapped.reduce((total, step) => total + step.duration, 0);
  const total = Math.max(trace.durationMs, sum);
  const segments = mapped.map((step, index) => ({
    ...step,
    color: stepColors[index % stepColors.length],
  }));
  return (
    <section className="breakdown" aria-label="Trace duration breakdown">
      <h3>
        Trace duration <code>{formatMs(trace.durationMs)}</code>
      </h3>
      <div className="duration-bar">
        {segments.map((step) => (
          <span
            key={step.id}
            style={{
              width: `${total ? (step.duration / total) * 100 : 0}%`,
              backgroundColor: step.color,
            }}
            title={`${step.label} · ${formatMs(step.duration)}`}
          />
        ))}
      </div>
      <ul>
        {segments.map((step) => (
          <li key={step.id}>
            <span>
              <i style={{ backgroundColor: step.color }} />
              {step.label}
            </span>
            <code>{formatMs(step.duration)}</code>
          </li>
        ))}
        {total > sum && (
          <li>
            <span>Other request work</span>
            <code>{formatMs(total - sum)}</code>
          </li>
        )}
      </ul>
    </section>
  );
}

export function Detail({ node, graph }: { node?: GraphNode; graph: Graph }) {
  const stats = useLive((state) => (node ? state.stats[node.id] : undefined));
  const trace = useLive((state) =>
    state.traces.find(({ traceId }) => traceId === state.selectedTrace),
  );
  const metrics = stats
    ? [
        ["Count", String(stats.count)],
        ["p50", formatMs(stats.p50Ms)],
        ["p95", formatMs(stats.p95Ms)],
        ["Last", formatMs(stats.lastMs)],
        ["Errors", String(stats.errorCount)],
      ]
    : [];
  return (
    <aside className="detail" aria-label="Node details">
      <p className="eyebrow">Node details</p>
      {node ? (
        <>
          <h2>{node.label}</h2>
          <p className="detail-kind">{node.kind}</p>
          {node.file && (
            <p className="file">
              {node.file}
              {node.range && `:${node.range.startLine}–${node.range.endLine}`}
            </p>
          )}
          {!!metrics.length && (
            <dl className="detail-stats">
              {metrics.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {node.kind === "feature" && trace?.featureId === node.id && (
            <TraceBreakdown graph={graph} trace={trace} />
          )}
          {node.kind === "function" && <Source key={node.id} node={node} />}
        </>
      ) : (
        <>
          <h2>Inspect a node</h2>
          <p className="muted">
            Select a node to see its source and trace details.
          </p>
        </>
      )}
    </aside>
  );
}
