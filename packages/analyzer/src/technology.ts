import { type GraphNode, technologyNames } from "@flowlens/core";
import { type Expression, Node } from "ts-morph";
import { declarations, packageName, rootExpression } from "./source";

export function detectedPackage(
  expression: Expression,
  visited = new Set<Node>(),
): string | undefined {
  const direct = packageName(expression);
  if (direct) return direct;
  for (const declaration of declarations(rootExpression(expression))) {
    if (!Node.isVariableDeclaration(declaration) || visited.has(declaration))
      continue;
    visited.add(declaration);
    const value = declaration.getInitializer();
    const found = value && detectedPackage(value, visited);
    if (found) return found;
  }
  return undefined;
}

export function addTechnologies(node: GraphNode, names: Iterable<string>) {
  const all = new Set([...technologyNames(node), ...names]);
  if (all.size) node.meta.technologies = [...all].sort();
}
