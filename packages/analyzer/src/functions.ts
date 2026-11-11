import { functionId, type GraphNode } from "@flowlens/core";
import {
  type ArrowFunction,
  type Expression,
  type FunctionDeclaration,
  type FunctionExpression,
  Node,
  type SourceFile,
  type VariableDeclaration,
  VariableDeclarationKind,
} from "ts-morph";
import { declarations, sourceRange, unparenthesize } from "./source";

export type Handler = FunctionDeclaration | FunctionExpression | ArrowFunction;

export interface ProjectFunction {
  declaration: FunctionDeclaration | VariableDeclaration;
  handler: Handler;
  node: GraphNode;
}

export function inlineHandler(expression: Expression) {
  const node = unparenthesize(expression);
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node)
    ? node
    : undefined;
}

export function collectFunctions(
  source: SourceFile,
  file: string,
  parentId: string,
) {
  const functions: ProjectFunction[] = [];
  const add = (
    declaration: ProjectFunction["declaration"],
    handler: Handler,
    name: string,
  ) => {
    functions.push({
      declaration,
      handler,
      node: {
        id: functionId(file, name),
        kind: "function",
        level: 3,
        label: name,
        parentId,
        file,
        range: sourceRange(declaration),
        meta: {},
      },
    });
  };
  for (const statement of source.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && statement.getBody()) {
      const name = statement.getName();
      if (name) add(statement, statement, name);
    }
    if (
      Node.isVariableStatement(statement) &&
      statement.getDeclarationKind() === VariableDeclarationKind.Const
    ) {
      for (const variable of statement.getDeclarations()) {
        const value = variable.getInitializer();
        const name = variable.getNameNode();
        const handler = value && inlineHandler(value);
        if (handler && Node.isIdentifier(name))
          add(variable, handler, name.getText());
      }
    }
  }
  return functions;
}

export function resolveFunction(
  expression: Expression,
  functions: ReadonlyMap<Node, ProjectFunction>,
) {
  for (const declaration of declarations(unparenthesize(expression))) {
    const entry = functions.get(declaration);
    if (entry) return entry;
  }
  return undefined;
}
