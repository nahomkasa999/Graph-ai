import {
  edgeId,
  featureId,
  type GraphEdge,
  type GraphNode,
  stepId,
  technologyNames,
} from "@nazs/flowlens-core";
import { Node, type SourceFile } from "ts-morph";
import {
  type Handler,
  inlineHandler,
  type ProjectFunction,
  resolveFunction,
} from "./functions";
import {
  declarations,
  expressionName,
  localCalls,
  packageName,
  relativePath,
  rootExpression,
  sourceRange,
  unparenthesize,
} from "./source";
import { detectedPackage } from "./technology";

const methods = new Set(["get", "post", "put", "patch", "delete"]);
const sendMethods = new Set(["json", "send", "text", "redirect"]);

function framework(receiver: Node) {
  if (!Node.isVariableDeclaration(receiver)) return undefined;
  const initializer = receiver.getInitializer();
  if (!initializer) return undefined;
  const value = unparenthesize(initializer);
  if (
    Node.isNewExpression(value) &&
    packageName(value.getExpression()) === "hono"
  )
    return "hono";
  if (
    Node.isCallExpression(value) &&
    packageName(value.getExpression()) === "express"
  )
    return "express";
  return undefined;
}

function literalPath(expression: Node | undefined) {
  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    const path = expression.getLiteralValue();
    if (path.startsWith("/") || path === "*") return path;
  }
  return undefined;
}

function joinRoute(prefix: string, path: string) {
  if (prefix === "/") return path;
  return (
    prefix.replace(/\/$/, "") + (path === "/" ? "" : path === "*" ? "/*" : path)
  );
}

export function collectRoutes(
  sources: SourceFile[],
  warn: (message: string) => void,
) {
  const routes = [];
  const mounts = new Map<Node, string[]>();
  for (const source of sources) {
    for (const statement of source.getStatements()) {
      if (!Node.isExpressionStatement(statement)) continue;
      const call = statement.getExpression();
      if (!Node.isCallExpression(call)) continue;
      const method = call.getExpression();
      if (!Node.isPropertyAccessExpression(method)) continue;
      const receiver = declarations(method.getExpression()).find(
        Node.isVariableDeclaration,
      );
      const owner = receiver && framework(receiver);
      if (!receiver || !owner) continue;

      const [first, second] = call.getArguments();
      const name = method.getName();
      const isMount =
        (owner === "hono" && name === "route") ||
        (owner === "express" && name === "use");
      if (isMount) {
        if (!second) continue;
        const child = declarations(second).find(Node.isVariableDeclaration);
        if (!child || framework(child) !== owner) continue;
        const prefix = literalPath(first);
        if (prefix) mounts.set(child, [...(mounts.get(child) ?? []), prefix]);
        else
          warn(
            `Skipping non-literal mount path at ${source.getBaseName()}:${call.getStartLineNumber()}`,
          );
      }
      if (!methods.has(name)) continue;
      const path = literalPath(first);
      if (!path) {
        warn(
          `Skipping non-literal route path at ${source.getBaseName()}:${call.getStartLineNumber()}`,
        );
        continue;
      }
      const last = call.getArguments().at(-1);
      if (Node.isExpression(last) && last !== first)
        routes.push({
          receiver,
          source,
          method: name.toUpperCase(),
          technology: owner,
          path,
          handler: last,
        });
    }
  }
  return routes.flatMap((route) =>
    (mounts.get(route.receiver) ?? [""]).map((prefix) => ({
      ...route,
      path: prefix ? joinRoute(prefix, route.path) : route.path,
    })),
  );
}

function statementCalls(
  handler: Handler,
  functions: ReadonlyMap<Node, ProjectFunction>,
) {
  const body = handler.getBody();
  if (!body) return [];
  const parameters = new Set(handler.getParameters());
  const statements = Node.isBlock(body) ? body.getStatements() : [body];
  return statements.flatMap((statement) => {
    const isReturn =
      Node.isReturnStatement(statement) || Node.isExpression(statement);
    if (
      !isReturn &&
      !Node.isVariableStatement(statement) &&
      !Node.isExpressionStatement(statement) &&
      !Node.isThrowStatement(statement)
    )
      return [];
    const calls = localCalls(statement);
    const project = calls
      .map((call) => resolveFunction(call.getExpression(), functions))
      .find(Boolean);
    const response =
      isReturn &&
      calls.some((call) => {
        const callee = call.getExpression();
        return (
          Node.isPropertyAccessExpression(callee) &&
          sendMethods.has(callee.getName()) &&
          declarations(rootExpression(callee)).some(
            (declaration) =>
              Node.isParameterDeclaration(declaration) &&
              parameters.has(declaration),
          )
        );
      });
    const call = calls.find(
      (candidate) =>
        !declarations(rootExpression(candidate.getExpression())).some(
          (declaration) =>
            Node.isParameterDeclaration(declaration) &&
            parameters.has(declaration),
        ),
    );
    if (!call && !response) return [];
    const expression = call?.getExpression();
    const callee = expression && expressionName(expression);
    const name = response
      ? "send response"
      : (project?.node.label ?? callee ?? "call");
    const label = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    const external =
      expression && !project && !response
        ? detectedPackage(expression)
        : undefined;
    const technologies = project
      ? technologyNames(project.node)
      : external
        ? [external]
        : [];
    return [
      {
        label,
        file: statement.getSourceFile().getFilePath(),
        range: sourceRange(statement),
        meta: {
          ...(project ? { functionId: project.node.id } : {}),
          ...(external ? { external } : {}),
          ...(technologies.length ? { technologies } : {}),
        },
      },
    ];
  });
}

export function routeGraph(
  root: string,
  routes: ReturnType<typeof collectRoutes>,
  modules: ReadonlyMap<SourceFile, string>,
  functions: ReadonlyMap<Node, ProjectFunction>,
  warn: (message: string) => void,
) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const features = new Set<string>();
  for (const route of routes) {
    const registered = resolveFunction(route.handler, functions);
    const handler = registered?.handler ?? inlineHandler(route.handler);
    const parentId = modules.get(route.source);
    if (!handler || !parentId) {
      warn(`Skipping unsupported handler for ${route.method} ${route.path}`);
      continue;
    }
    const id = featureId(route.method, route.path);
    if (features.has(id)) {
      warn(`Skipping duplicate route ${route.method} ${route.path}`);
      continue;
    }
    features.add(id);
    const file = relativePath(root, handler.getSourceFile().getFilePath());
    nodes.push({
      id,
      kind: "feature",
      level: 1,
      parentId,
      label: `${route.method} ${route.path}`,
      file,
      range: sourceRange(handler),
      meta: {
        method: route.method,
        path: route.path,
        handlerId: registered?.node.id ?? null,
        technologies: [route.technology],
      },
    });
    const steps = [
      {
        label: "receive request",
        file: handler.getSourceFile().getFilePath(),
        range: sourceRange(handler),
        meta: {},
      },
      ...statementCalls(handler, functions),
    ];
    let previous: string | undefined;
    const occurrences = new Map<string, number>();
    for (const [order, step] of steps.entries()) {
      const occurrence = (occurrences.get(step.label) ?? 0) + 1;
      occurrences.set(step.label, occurrence);
      const stepKey = stepId(
        id,
        occurrence === 1 ? step.label : `${step.label}#${occurrence}`,
      );
      nodes.push({
        id: stepKey,
        kind: "step",
        level: 2,
        parentId: id,
        label: step.label,
        file: relativePath(root, step.file),
        range: step.range,
        meta: { ...step.meta, order },
      });
      if (previous)
        edges.push({
          id: edgeId("flow", previous, stepKey),
          kind: "flow",
          from: previous,
          to: stepKey,
          order,
        });
      previous = stepKey;
    }
  }
  return { nodes, edges };
}
