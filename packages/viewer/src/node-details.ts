import type { Graph, GraphNode } from "@nazs/flowlens-core";

export interface NodeDetails {
  summary: string;
  footer: string;
  source?: string;
}

function addTo(map: Map<string, GraphNode[]>, id: string, node: GraphNode) {
  const list = map.get(id);
  if (list) list.push(node);
  else map.set(id, [node]);
}

const counted = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

export function describeNodes(graph: Graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map<string, GraphNode[]>();
  const calls = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (node.parentId) addTo(children, node.parentId, node);
  }
  for (const edge of graph.edges) {
    const target = nodes.get(edge.to);
    if (edge.kind === "calls" && target) addTo(calls, edge.from, target);
  }
  return (node: GraphNode): NodeDetails => {
    const members = children.get(node.id) ?? [];
    const source =
      node.file &&
      `${node.file}${node.range ? `:${node.range.startLine}` : ""}`;
    const footer = source?.split("/").at(-1) ?? "";
    switch (node.kind) {
      case "module": {
        const routes = members.filter((item) => item.kind === "feature");
        const entries = routes.length ? routes : members;
        return {
          summary:
            entries
              .slice(0, 2)
              .map(({ label }) => label)
              .join(", ") || "Project files grouped in this module.",
          footer: counted(entries.length, routes.length ? "route" : "function"),
        };
      }
      case "feature": {
        const steps = members
          .filter(
            ({ meta }) => typeof meta.order === "number" && meta.order > 0,
          )
          .sort(
            (left, right) => Number(left.meta.order) - Number(right.meta.order),
          );
        return {
          summary: steps.length
            ? `Runs ${steps
                .slice(0, 2)
                .map(({ label }) => label)
                .join(", ")}${steps.length > 2 ? " and more" : ""}.`
            : "Receives the incoming HTTP request.",
          footer: footer || counted(members.length, "step"),
          source,
        };
      }
      case "step": {
        const callee =
          typeof node.meta.functionId === "string"
            ? nodes.get(node.meta.functionId)
            : undefined;
        const summary =
          node.label === "send response"
            ? callee
              ? `Returns the result of ${callee.label}().`
              : "Sends the HTTP response."
            : callee
              ? `Calls ${callee.label}().`
              : typeof node.meta.external === "string"
                ? `Calls into ${node.meta.external}.`
                : node.label === "receive request"
                  ? "Receives the incoming HTTP request."
                  : "Runs this operation in the route handler.";
        return { summary, footer, source };
      }
      case "function": {
        const targets = calls.get(node.id) ?? [];
        const signature =
          typeof node.meta.signature === "string"
            ? node.meta.signature
            : `${node.label}()`;
        return {
          summary: targets.length
            ? `Calls ${targets
                .slice(0, 2)
                .map(({ label }) => `${label}()`)
                .join(", ")}.`
            : signature,
          footer,
          source,
        };
      }
    }
  };
}
