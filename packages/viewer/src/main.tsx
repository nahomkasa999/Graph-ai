import "@xyflow/react/dist/style.css";
import "./style.css";
import "./panels.css";
import { Graph, type GraphNode } from "@flowlens/core";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Detail } from "./detail";
import { Canvas } from "./graph-canvas";
import {
  breadcrumb,
  hashFor,
  readTrail,
  scope,
  searchNodes,
  useView,
} from "./model";

function Search({
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

function Workspace({ graph }: { graph: Graph }) {
  const trail = useView((state) => state.trail);
  const focus = trail.at(-1) ?? null;
  const selected = useView((state) => state.selected);
  const select = useView((state) => state.select);
  const setFocus = useView((state) => state.focus);
  const [searchOpen, showSearch] = useState(false);

  useEffect(() => {
    const restore = () => setFocus(readTrail(graph));
    restore();
    if (!location.hash) history.replaceState(history.state, "", hashFor(null));
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [graph, setFocus]);

  const navigate = useCallback(
    (next: string[]) => {
      const hash = hashFor(next.at(-1) ?? null);
      if (location.hash !== hash)
        history.pushState({ flowlensTrail: next }, "", hash);
      setFocus(next);
    },
    [setFocus],
  );

  const drill = useCallback(
    (node: GraphNode) => {
      if (node.id === focus) return;
      if (trail.includes(node.id)) {
        navigate(trail.slice(0, trail.indexOf(node.id) + 1));
      } else {
        navigate([...trail, node.id]);
      }
    },
    [focus, navigate, trail],
  );

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (searchOpen) showSearch(false);
        else if (trail.length) navigate(trail.slice(0, -1));
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "BUTTON"].includes(event.target.tagName) ||
          event.target.isContentEditable)
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        showSearch(true);
        return;
      }
      if (searchOpen) return;
      const nodes = scope(graph, focus);
      if (event.key === "Enter" && selected) {
        const node = graph.nodes.find(({ id }) => id === selected);
        if (node) {
          event.preventDefault();
          drill(node);
        }
      }
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) &&
        nodes.length
      ) {
        event.preventDefault();
        const position = nodes.findIndex(({ id }) => id === selected);
        const step =
          event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const next =
          position < 0
            ? step > 0
              ? 0
              : nodes.length - 1
            : (position + step + nodes.length) % nodes.length;
        select(nodes[next].id);
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [drill, focus, graph, navigate, searchOpen, select, selected, trail]);

  const detail = graph.nodes.find(({ id }) => id === (selected ?? focus));
  const command =
    document.body.dataset.startCommand ??
    "node --import @flowlens/tracer/register src/index.ts";

  return (
    <div className="workspace">
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⌁
          </span>{" "}
          Flowlens
        </div>
        <nav aria-label="Breadcrumb">
          <button
            type="button"
            aria-current={trail.length ? undefined : "location"}
            onClick={() => navigate([])}
          >
            System
          </button>
          {trail.map((id, index) => (
            <div className="crumb" key={id}>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                aria-current={id === focus ? "location" : undefined}
                onClick={() => navigate(trail.slice(0, index + 1))}
              >
                {graph.nodes.find((node) => node.id === id)?.label ?? id}
              </button>
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="search-button"
          onClick={() => showSearch(true)}
        >
          Search nodes <kbd>/</kbd>
        </button>
      </header>
      <main className="main">
        <Canvas graph={graph} focus={focus} onDrill={drill} />
        <Detail node={detail} />
      </main>
      <section className="trace-panel" aria-label="Recent traces">
        <h2>Recent traces</h2>
        <p className="muted">
          Start your app with tracing to see requests here.
        </p>
        <code>{command}</code>
      </section>
      {searchOpen && (
        <Search
          graph={graph}
          choose={(node) => {
            navigate(breadcrumb(graph, node.id));
            showSearch(false);
          }}
          close={() => showSearch(false)}
        />
      )}
    </div>
  );
}

function App() {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/graph", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Graph unavailable");
        return Graph.parse(await response.json());
      })
      .then(setGraph)
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, []);
  if (!graph)
    return (
      <main className="loading">
        {error
          ? "Could not load the graph. Reload to retry."
          : "Loading Flowlens…"}
      </main>
    );
  return <Workspace graph={graph} />;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
