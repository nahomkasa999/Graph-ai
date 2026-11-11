import { type GraphNode, SourceResponse } from "@flowlens/core";
import { useEffect, useState } from "react";

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

export function Detail({ node }: { node?: GraphNode }) {
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
