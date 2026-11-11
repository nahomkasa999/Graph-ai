import type { Graph, GraphNode } from "@nazs/flowlens-core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { searchNodes } from "./model";

export function Search({
  graph,
  choose,
  close,
}: {
  graph: Graph;
  choose: (node: GraphNode) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const matches = searchNodes(graph.nodes, query);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (matches[0]) choose(matches[0]);
  }
  return (
    <div className="search-backdrop">
      <section
        className="search"
        role="dialog"
        aria-modal="true"
        aria-label="Search nodes"
      >
        <form onSubmit={submit}>
          <input
            ref={input}
            aria-label="Search by label"
            placeholder="Search nodes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="key-button" onClick={close}>
            Esc
          </button>
        </form>
        <ul>
          {matches.map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => choose(node)}>
                <span>{node.label}</span>
                <small>{node.kind}</small>
              </button>
            </li>
          ))}
        </ul>
        {!matches.length && <p className="muted">No matching nodes</p>}
      </section>
    </div>
  );
}
