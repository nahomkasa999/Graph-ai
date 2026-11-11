import { z } from "zod";

export const NodeKind = z.enum(["module", "feature", "step", "function"]);
export const EdgeKind = z.enum(["flow", "calls", "depends"]);
const Metadata = z.record(z.string(), z.unknown()).default({});
const Line = z.number().int().positive();
export const SourceRange = z
  .object({ startLine: Line, endLine: Line })
  .refine(({ startLine, endLine }) => endLine >= startLine, {
    message: "End line precedes start line",
  });
export const GraphNode = z.object({
  id: z.string(),
  kind: NodeKind,
  level: z.number().int().min(0).max(3),
  label: z.string(),
  parentId: z.string().nullable(),
  file: z.string().optional(),
  range: SourceRange.optional(),
  meta: Metadata,
});
export const GraphEdge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: EdgeKind,
  order: z.number().int().optional(),
});
export const Graph = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  root: z.string(),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export const SpanEvent = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  nodeId: z.string().nullable(),
  featureId: z.string().nullable(),
  stepId: z.string().nullable(),
  name: z.string(),
  startMs: z.number(),
  durationMs: z.number().nonnegative(),
  status: z.enum(["ok", "error"]),
  attributes: Metadata,
});
export const TraceComplete = z.object({
  traceId: z.string(),
  featureId: z.string().nullable(),
  durationMs: z.number().nonnegative(),
});
export const Trace = TraceComplete.extend({ spans: z.array(SpanEvent) });
export const NodeStats = z.object({
  count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  lastMs: z.number(),
});
export const Stats = z.record(z.string(), NodeStats);
export const Instrumentation = z.array(
  z.object({
    file: z.string(),
    name: z.string(),
    nodeId: z.string(),
  }),
);
export const SourceResponse = z.object({ lines: z.array(z.string()) });

export type GraphNode = z.infer<typeof GraphNode>;
export type GraphEdge = z.infer<typeof GraphEdge>;
export type Graph = z.infer<typeof Graph>;
export type SpanEvent = z.infer<typeof SpanEvent>;
export type TraceComplete = z.infer<typeof TraceComplete>;
export type Trace = z.infer<typeof Trace>;
export type NodeStats = z.infer<typeof NodeStats>;
export type Stats = z.infer<typeof Stats>;
export type Instrumentation = z.infer<typeof Instrumentation>;

export const moduleId = (group: string) => `mod:${group}`;
export const functionId = (file: string, name: string) => `fn:${file}#${name}`;
export const featureId = (method: string, path: string) =>
  `feat:${method} ${path}`;
export const stepId = (feature: string, name: string) =>
  `step:${feature.slice(5)}#${name}`;
export const edgeId = (kind: GraphEdge["kind"], from: string, to: string) =>
  `${kind}:${from.length}:${from}${to}`;
