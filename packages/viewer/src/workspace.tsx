import type { Graph, GraphNode, Trace } from "@flowlens/core";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Detail } from "./detail";
import { replayTrace, useLive } from "./live";
import { breadcrumb, hashFor, readTrail, scope, useView } from "./model";
import { Search } from "./search";
import { TracePanel } from "./trace-panel";

const Canvas = lazy(async () => ({
  default: (await import("./graph-canvas")).Canvas,
}));

export function Workspace({ graph }: { graph: Graph }) {
  const trail = useView((state) => state.trail);
  const focus = trail.at(-1) ?? null;
  const selected = useView((state) => state.selected);
  const select = useView((state) => state.select);
  const setFocus = useView((state) => state.focus);
  const [searchOpen, showSearch] = useState(false);
  const connection = useLive((state) => state.connection);

  useEffect(() => {
    const restore = () => setFocus(readTrail(graph));
    const saved = readTrail(graph);
    if (JSON.stringify(useView.getState().trail) !== JSON.stringify(saved))
      setFocus(saved);
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
  function selectTrace(trace: Trace) {
    if (
      trace.featureId &&
      focus !== trace.featureId &&
      graph.nodes.some(({ id }) => id === trace.featureId)
    ) {
      navigate(breadcrumb(graph, trace.featureId));
    }
    select(null);
    replayTrace(trace);
  }

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
        {connection === "disconnected" && (
          <div className="connection-banner" role="status">
            Disconnected. Reconnecting…
          </div>
        )}
        <Suspense
          fallback={
            <div className="canvas">
              <div className="canvas-empty">Loading graph…</div>
            </div>
          }
        >
          <Canvas graph={graph} focus={focus} onDrill={drill} />
        </Suspense>
        <Detail node={detail} graph={graph} />
      </main>
      <TracePanel graph={graph} onTrace={selectTrace} />
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
