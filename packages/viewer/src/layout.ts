import type { Graph, GraphNode, NodeStats } from "@flowlens/core";
import {
  type Edge,
  MarkerType,
  type Node,
  type XYPosition,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk-api.js";
import workerUrl from "elkjs/lib/elk-worker.min.js?url";
import { scope } from "./model";

export type CardNode = Node<
  {
    node: GraphNode;
    group: string;
    open: boolean;
    stats?: NodeStats;
    tone?: "neutral" | "amber" | "red";
  },
  "graphCard"
>;
export type CardEdge = Edge<{ kind: "flow" | "calls" | "depends" }>;
export type Layout = {
  nodes: CardNode[];
  edges: CardEdge[];
  width: number;
  height: number;
};

const elk = new ELK({ workerUrl });
const cardWidth = 188;
const cardHeight = 96;
const padding = 26;
const cache = new Map<string, Map<string, XYPosition>>();

export const emptyLayout: Layout = {
  nodes: [],
  edges: [],
  width: 0,
  height: 0,
};

export async function layoutGraph(
  graph: Graph,
  focus: string | null,
  expanded: ReadonlySet<string>,
): Promise<Layout> {
  const visited = new Set(focus ? [focus] : []);
  return layoutScope(graph, focus, expanded, visited, "");
}

async function layoutScope(
  graph: Graph,
  focus: string | null,
  expanded: ReadonlySet<string>,
  visited: Set<string>,
  parent: string,
): Promise<Layout> {
  const group = scope(graph, focus);
  if (!group.length) return emptyLayout;
  const records = await Promise.all(
    group.map(async (node) => {
      const id = `${parent}/${encodeURIComponent(node.id)}`;
      const open = expanded.has(id) && !visited.has(node.id);
      const nested = open
        ? await layoutScope(
            graph,
            node.id,
            expanded,
            new Set([...visited, node.id]),
            id,
          )
        : emptyLayout;
      const width = Math.max(
        node.kind === "step" ? 152 : cardWidth,
        nested.width + padding * 2,
      );
      const height = nested.nodes.length
        ? cardHeight + nested.height + padding
        : cardHeight;
      return { node, id, width, height, nested, open };
    }),
  );
  const ids = new Map(records.map(({ node, id }) => [node.id, id]));
  const edges = graph.edges.flatMap((edge): CardEdge[] => {
    const source = ids.get(edge.from);
    const target = ids.get(edge.to);
    if (!source || !target) return [];
    return [
      {
        id: `${parent}/${edge.id}`,
        source,
        target,
        type: "smoothstep",
        data: { kind: edge.kind },
        markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13 },
      },
    ];
  });
  const key = JSON.stringify([
    graph.root,
    parent,
    focus,
    records.map(({ id, width, height }) => [id, width, height]),
    edges.map(({ id }) => id),
  ]);
  let positions = cache.get(key);
  if (!positions) {
    const layered = await elk.layout({
      id: "scope",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "30",
        "elk.layered.spacing.nodeNodeBetweenLayers":
          group[0]?.kind === "step" ? "30" : "46",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.considerModelOrder.components": "MODEL_ORDER",
        "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      },
      children: records.map(({ id, width, height }) => ({ id, width, height })),
      edges: edges.map(({ id, source, target }) => ({
        id,
        sources: [source],
        targets: [target],
      })),
    });
    positions = new Map(
      layered.children?.map(({ id, x, y }) => [id, { x: x ?? 0, y: y ?? 0 }]),
    );
    if (cache.size >= 128) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
    cache.set(key, positions);
  }
  const result: Layout = { nodes: [], edges, width: 0, height: 0 };
  for (const record of records) {
    const { node, id, open, nested, width, height } = record;
    const position = positions.get(id) ?? { x: 0, y: 0 };
    result.nodes.push({
      id,
      type: "graphCard",
      position,
      parentId: parent || undefined,
      draggable: false,
      width,
      height,
      ariaLabel: node.label,
      data: { node, group: parent, open },
    });
    result.nodes.push(
      ...nested.nodes.map((child) =>
        child.parentId === id
          ? {
              ...child,
              position: {
                x: child.position.x + padding,
                y: child.position.y + cardHeight,
              },
            }
          : child,
      ),
    );
    result.edges.push(...nested.edges);
    result.width = Math.max(result.width, position.x + width);
    result.height = Math.max(result.height, position.y + height);
  }
  return result;
}
