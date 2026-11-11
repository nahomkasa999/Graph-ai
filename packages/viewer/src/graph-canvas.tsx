import type { Graph, GraphNode } from "@flowlens/core";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  type CSSProperties,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CardEdge,
  type CardNode,
  emptyLayout,
  layoutGraph,
} from "./layout";
import { formatMs, useLive } from "./live";
import { useView } from "./model";

function GraphCard({ data, selected }: NodeProps<CardNode>) {
  const { node, open, stats, tone } = data;
  const pulse = useLive((state) => state.pulses[node.id]);
  return (
    <div
      className={`graph-card ${selected ? "is-selected" : ""} ${open ? "is-expanded" : ""}`}
      data-node-kind={node.kind}
      data-tone={tone}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="card-content">
        <div className="card-kind">
          <span className="kind-mark" />
          {node.kind}
        </div>
        <div className="card-title">{node.label}</div>
        {stats && (
          <div
            className="node-stats"
            data-testid="node-stats"
            data-count={stats.count}
            title={`p50 ${formatMs(stats.p50Ms)} · ${stats.count} spans`}
          >
            {formatMs(stats.p50Ms)} <span>· {stats.count}</span>
          </div>
        )}
        {!!stats?.errorCount && (
          <span
            className="node-error"
            role="img"
            aria-label="Errors in recent spans"
            data-testid="node-error"
          />
        )}
      </div>
      {pulse && (
        <span
          className="node-pulse"
          key={pulse}
          data-testid="node-pulse"
          aria-hidden="true"
        />
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { graphCard: GraphCard };

type CanvasProps = {
  graph: Graph;
  focus: string | null;
  onDrill: (node: GraphNode) => void;
};

function GraphCanvas({ graph, focus, onDrill }: CanvasProps) {
  const [layout, setLayout] = useState(emptyLayout);
  const [error, setError] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState<CSSProperties>();
  const element = useRef<HTMLElement>(null);
  const selected = useView((state) => state.selected);
  const expanded = useView((state) => state.expanded);
  const select = useView((state) => state.select);
  const toggle = useView((state) => state.toggle);
  const stats = useLive((state) => state.stats);
  const pulses = useLive((state) => state.pulses);
  const { fitView } = useReactFlow<CardNode, CardEdge>();

  useEffect(() => {
    let current = true;
    void layoutGraph(graph, focus, expanded)
      .then((next) => {
        if (current) {
          setLayout(next);
          setError(false);
        }
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [graph, focus, expanded]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (layout.nodes.length)
        void fitView({ padding: 0.1, maxZoom: 1.12, duration: 220 });
    });
    return () => cancelAnimationFrame(frame);
  }, [layout, fitView]);

  function drill(event: MouseEvent, node: CardNode) {
    const bounds = element.current?.getBoundingClientRect();
    const target = event.currentTarget.getBoundingClientRect();
    if (bounds)
      setZoomOrigin({
        left: target.left - bounds.left,
        top: target.top - bounds.top,
        width: target.width,
        height: target.height,
      });
    onDrill(node.data.node);
  }

  const slowest = new Map<string, number>();
  const byRenderId = new Map<string, string>();
  for (const { id, data } of layout.nodes) {
    const duration = stats[data.node.id]?.p95Ms ?? 0;
    slowest.set(data.group, Math.max(slowest.get(data.group) ?? 0, duration));
    byRenderId.set(id, data.node.id);
  }
  const nodes: CardNode[] = layout.nodes.map((node) => {
    const sample = stats[node.data.node.id];
    const max = slowest.get(node.data.group) ?? 0;
    const ratio = sample && max ? sample.p95Ms / max : 0;
    const tone = ratio > 0.8 ? "red" : ratio > 0.5 ? "amber" : "neutral";
    return {
      ...node,
      selected: node.data.node.id === selected,
      data: { ...node.data, stats: sample, tone },
    };
  });
  const edges = layout.edges.map((edge) => {
    const target = byRenderId.get(edge.target);
    const animated = target ? Boolean(pulses[target]) : false;
    return {
      ...edge,
      animated,
      className: animated ? "edge-pulse" : undefined,
    };
  });

  return (
    <section className="canvas" ref={element} aria-label="Code graph">
      <ReactFlow<CardNode, CardEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(event, node) => {
          if (event.shiftKey) toggle(node.id);
          select(node.data.node.id);
        }}
        onNodeDoubleClick={(event, node) => drill(event, node)}
        onPaneClick={() => select(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.12}
        maxZoom={2.5}
        colorMode="system"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1.25} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      {zoomOrigin && (
        <div
          key={focus}
          className="focus-zoom"
          style={zoomOrigin}
          onAnimationEnd={() => setZoomOrigin(undefined)}
        />
      )}
      {!layout.nodes.length && (
        <div className="canvas-empty">
          {error ? "Graph layout failed" : "No code nodes at this level"}
        </div>
      )}
      <div className="canvas-help">
        <kbd>↵</kbd> Drill down <kbd>Esc</kbd> Go up <kbd>Shift</kbd> Expand
      </div>
    </section>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
