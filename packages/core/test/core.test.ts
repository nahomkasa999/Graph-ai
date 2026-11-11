import { expect, test } from "vitest";
import {
  edgeId,
  functionId,
  Graph,
  GraphNode,
  SourceRange,
  SpanEvent,
} from "../src/index";

test("core graph contracts validate their version, levels and source ranges", () => {
  expect(
    Graph.safeParse({
      version: 2,
      generatedAt: new Date().toISOString(),
      root: "/",
      nodes: [],
      edges: [],
    }).success,
  ).toBe(false);
  expect(SourceRange.safeParse({ startLine: 2, endLine: 1 }).success).toBe(
    false,
  );
  expect(
    GraphNode.safeParse({
      id: "node",
      kind: "function",
      level: 4,
      label: "node",
      parentId: null,
    }).success,
  ).toBe(false);
  expect(SpanEvent.safeParse({}).success).toBe(false);
  expect(functionId("src/notes.ts", "createNote")).toBe(
    "fn:src/notes.ts#createNote",
  );
  expect(edgeId("flow", "ab", "c")).not.toBe(edgeId("flow", "a", "bc"));
});
