import type { Graph, GraphNode } from "@flowlens/core";
import { create } from "zustand";

const order = (node: GraphNode) =>
  typeof node.meta.order === "number" ? node.meta.order : 0;

export function scope(graph: Graph, focus: string | null) {
  const node = graph.nodes.find(({ id }) => id === focus);
  const members = graph.nodes.filter(
    (child) => child.parentId === (node?.id ?? null),
  );
  if (!node) return members.filter(({ kind }) => kind === "module");
  if (node.kind === "module") {
    const features = members.filter(({ kind }) => kind === "feature");
    return features.length ? features : members;
  }
  if (node.kind === "feature")
    return members.sort((left, right) => order(left) - order(right));
  const reference = node.kind === "function" ? node.id : node.meta.functionId;
  if (typeof reference !== "string") return [];
  const ids = new Set([reference]);
  for (const edge of graph.edges) {
    if (edge.kind !== "calls") continue;
    if (edge.from === reference) ids.add(edge.to);
    if (edge.to === reference) ids.add(edge.from);
  }
  return graph.nodes
    .filter(({ id }) => ids.has(id))
    .sort(
      (left, right) =>
        Number(right.id === reference) - Number(left.id === reference),
    );
}

export function breadcrumb(graph: Graph, id: string | null) {
  const trail: string[] = [];
  const index = new Map(graph.nodes.map((node) => [node.id, node]));
  let node = id ? index.get(id) : undefined;
  while (node && !trail.includes(node.id)) {
    trail.unshift(node.id);
    node = node.parentId ? index.get(node.parentId) : undefined;
  }
  return trail;
}

export function hashFor(id: string | null) {
  return `#/${id ? encodeURIComponent(id).replaceAll("%3A", ":").replaceAll("%2F", "/") : ""}`;
}

export function readTrail(graph: Graph) {
  try {
    const id = decodeURIComponent(
      location.hash.startsWith("#/") ? location.hash.slice(2) : "",
    );
    const saved: unknown = history.state?.flowlensTrail;
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (
      Array.isArray(saved) &&
      saved.at(-1) === id &&
      saved.every(
        (part): part is string => typeof part === "string" && ids.has(part),
      )
    )
      return saved;
    return breadcrumb(graph, id);
  } catch {
    return [];
  }
}

type View = {
  trail: string[];
  selected: string | null;
  expanded: ReadonlySet<string>;
  select: (id: string | null) => void;
  focus: (trail: string[]) => void;
  toggle: (id: string) => void;
};

export const useView = create<View>((set) => ({
  trail: [],
  selected: null,
  expanded: new Set(),
  select: (selected) => set({ selected }),
  focus: (trail) => set({ trail, selected: null, expanded: new Set() }),
  toggle: (id) =>
    set(({ expanded }) => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expanded: next };
    }),
}));

export function searchNodes(nodes: GraphNode[], query: string) {
  const text = query.trim().toLowerCase();
  function rank(label: string) {
    const normalized = label.toLowerCase();
    const exact = normalized.indexOf(text);
    if (exact >= 0) return exact + (normalized.length - text.length) / 100;
    let offset = 0;
    let cost = 30;
    for (const character of text) {
      const next = normalized.indexOf(character, offset);
      if (next === -1) return Infinity;
      cost += next - offset;
      offset = next + 1;
    }
    return cost;
  }
  return nodes
    .map((node) => ({ node, score: rank(node.label) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.node.label.localeCompare(right.node.label),
    )
    .slice(0, 12)
    .map(({ node }) => node);
}
