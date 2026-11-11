import type { Graph, SpanEvent } from "@nazs/flowlens-core";
import type { RawSpan } from "./otlp";

function routeExpression(path: string) {
  const segments = path.split("/").map((part) => {
    if (part.startsWith(":")) return "[^/]+";
    if (part === "*") return ".*";
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${segments.join("/")}$`);
}

export function makeMapper(graph: Graph) {
  const nodes = new Set(graph.nodes.map((node) => node.id));
  const routes = graph.nodes
    .flatMap((node) => {
      const { method, path } = node.meta;
      if (
        node.kind !== "feature" ||
        typeof method !== "string" ||
        typeof path !== "string"
      )
        return [];
      const dynamic = /(?:^|\/)(?::|\*)/.test(path);
      return [
        {
          id: node.id,
          method,
          path,
          match: dynamic ? routeExpression(path) : undefined,
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(Boolean(left.match)) - Number(Boolean(right.match)),
    );
  const steps = new Map<string, { id: string; fn: string; order: number }[]>();
  for (const node of graph.nodes) {
    const { functionId, order } = node.meta;
    if (
      node.kind !== "step" ||
      !node.parentId ||
      typeof functionId !== "string"
    )
      continue;
    const list = steps.get(node.parentId) ?? [];
    list.push({
      id: node.id,
      fn: functionId,
      order: typeof order === "number" ? order : 0,
    });
    steps.set(node.parentId, list);
  }
  for (const list of steps.values())
    list.sort((left, right) => left.order - right.order);

  function requestFeature(span: RawSpan) {
    if (!span.server) return null;
    const method =
      span.attributes["http.request.method"] ?? span.attributes["http.method"];
    const target =
      span.attributes["url.path"] ?? span.attributes["http.target"];
    if (typeof method !== "string" || typeof target !== "string") return null;
    const path = target.split("?")[0];
    return (
      routes.find(
        (route) =>
          route.method === method.toUpperCase() &&
          (route.match ? route.match.test(path) : route.path === path),
      )?.id ?? null
    );
  }

  function map(spans: Iterable<RawSpan>): SpanEvent[] {
    const ordered = [...spans].sort((left, right) =>
      left.startNano < right.startNano
        ? -1
        : left.startNano > right.startNano
          ? 1
          : 0,
    );
    const feature =
      ordered.map(requestFeature).find((id) => id !== null) ?? null;
    const used = new Set<string>();
    return ordered.map((span) => {
      const marker = span.attributes["flowlens.node"];
      const functionId =
        typeof marker === "string" && nodes.has(marker) ? marker : null;
      const nodeId = functionId ?? requestFeature(span);
      const step =
        functionId && feature
          ? steps
              .get(feature)
              ?.find(({ id, fn }) => fn === functionId && !used.has(id))
          : undefined;
      if (step) used.add(step.id);
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        nodeId,
        featureId: feature,
        stepId: step?.id ?? null,
        name: span.name,
        startMs: span.startMs,
        durationMs: span.durationMs,
        status: span.status,
        attributes: span.attributes,
      };
    });
  }

  return { map, requestFeature };
}
