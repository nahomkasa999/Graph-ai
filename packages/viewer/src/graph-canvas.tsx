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
import { useView } from "./model";

function GraphCard({ data, selected }: NodeProps<CardNode>) {
  const { node, open } = data;
  return (
    <div
      className={`graph-card ${selected ? "is-selected" : ""} ${open ? "is-expanded" : ""}`}
      data-node-kind={node.kind}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="card-content">
        <div className="card-kind">
          <span className="kind-mark" />
          {node.kind}
        </div>
        <div className="card-title">{node.label}</div>
      </div>
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
        void fitView({ padding: 0.17, maxZoom: 1.12, duration: 220 });
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

  return (
    <section className="canvas" ref={element} aria-label="Code graph">
      <ReactFlow<CardNode, CardEdge>
        nodes={layout.nodes.map((node) => ({
          ...node,
          selected: node.data.node.id === selected,
        }))}
        edges={layout.edges}
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
