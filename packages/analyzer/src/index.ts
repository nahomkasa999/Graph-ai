import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, matchesGlob, resolve } from "node:path";
import {
  edgeId,
  Graph,
  type GraphEdge,
  type GraphNode,
  Instrumentation,
  moduleId,
} from "@flowlens/core";
import { type Node, Project, type SourceFile } from "ts-morph";
import { z } from "zod";
import {
  collectFunctions,
  type ProjectFunction,
  resolveFunction,
} from "./functions";
import { collectRoutes, routeGraph } from "./routes";
import { isSourcePath, localCalls, ownSources, relativePath } from "./source";

export const AnalyzerConfig = z.object({
  modules: z.record(z.string().min(1), z.string().min(1)).default({}),
});

export interface AnalyzeOptions {
  write?: boolean;
  onWarning?: (message: string) => void;
}

async function modulePatterns(root: string) {
  try {
    return Object.entries(
      AnalyzerConfig.parse(
        JSON.parse(await readFile(join(root, "flowlens.config.json"), "utf8")),
      ).modules,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return [];
    throw error;
  }
}

function moduleFor(file: string, patterns: [string, string][]) {
  const override = patterns.find(([glob]) => matchesGlob(file, glob));
  if (override) return { id: moduleId(override[1]), label: override[1] };
  const parts = file.split("/");
  const directory =
    parts[0] === "src"
      ? parts.length > 2
        ? `src/${parts[1]}`
        : "src"
      : parts.length > 1
        ? parts[0]
        : ".";
  return {
    id: moduleId(directory),
    label:
      directory === "src" || directory === "."
        ? "root"
        : (directory.split("/").at(-1) ?? directory),
  };
}

async function writeJson(root: string, file: string, data: unknown) {
  const directory = join(root, ".flowlens");
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
    await rename(temporary, join(directory, file));
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function analyze(
  projectRoot: string,
  options: AnalyzeOptions = {},
): Promise<Graph> {
  const root = await realpath(projectRoot);
  const config = join(root, "tsconfig.json");
  const project = new Project({ tsConfigFilePath: config });
  const sources = ownSources(project.getSourceFiles(), root);
  const patterns = await modulePatterns(root);
  const modules = new Map<SourceFile, string>();
  const nodes = new Map<string, GraphNode>();
  const functions = new Map<Node, ProjectFunction>();
  const edges = new Map<string, GraphEdge>();
  const warn =
    options.onWarning ??
    ((message: string) =>
      process.emitWarning(message, { code: "FLOWLENS_ANALYZER" }));

  for (const source of sources) {
    const file = relativePath(root, source.getFilePath());
    const module = moduleFor(file, patterns);
    modules.set(source, module.id);
    nodes.set(module.id, {
      ...module,
      kind: "module",
      level: 0,
      parentId: null,
      meta: {},
    });
    for (const entry of collectFunctions(source, file, module.id)) {
      functions.set(entry.declaration, entry);
      nodes.set(entry.node.id, entry.node);
    }
  }
  function addEdge(kind: GraphEdge["kind"], from: string, to: string) {
    const id = edgeId(kind, from, to);
    edges.set(id, { id, kind, from, to });
  }
  for (const entry of functions.values()) {
    const body = entry.handler.getBody();
    if (!body) continue;
    for (const call of localCalls(body)) {
      const target = resolveFunction(call.getExpression(), functions);
      if (target) addEdge("calls", entry.node.id, target.node.id);
    }
  }
  for (const [source, from] of modules) {
    for (const entry of source.getImportDeclarations()) {
      const imported = entry.getModuleSpecifierSourceFile();
      const to = imported && modules.get(imported);
      if (to && to !== from) addEdge("depends", from, to);
    }
  }
  const routes = routeGraph(
    root,
    collectRoutes(sources, warn),
    modules,
    functions,
    warn,
  );
  for (const node of routes.nodes) nodes.set(node.id, node);
  for (const edge of routes.edges) edges.set(edge.id, edge);
  const timestamps = await Promise.all(
    [config, ...sources.map((source) => source.getFilePath())].map(
      async (file) => (await stat(file)).mtimeMs,
    ),
  );
  const sortById = <T extends { id: string }>(items: Iterable<T>) =>
    [...items].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
  const graph = Graph.parse({
    version: 1,
    root,
    generatedAt: new Date(
      timestamps.reduce((latest, value) => Math.max(latest, value), 0),
    ).toISOString(),
    nodes: sortById(nodes.values()),
    edges: sortById(edges.values()),
  });
  if (options.write !== false) {
    const manifest = Instrumentation.parse(
      sortById(
        [...functions.values()].map(({ node }) => ({
          id: node.id,
          nodeId: node.id,
          file: node.file,
          name: node.label,
        })),
      ),
    );
    await writeJson(root, "instrument.json", manifest);
    await writeJson(root, "graph.json", graph);
  }
  return graph;
}

export function watchProject(
  projectRoot: string,
  options: AnalyzeOptions & {
    onGraph?: (graph: Graph) => void;
    onError: (error: unknown) => void;
  },
) {
  const root = resolve(projectRoot);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let requested = false;
  let closed = false;
  async function refresh() {
    if (running || closed) return;
    running = true;
    try {
      do {
        requested = false;
        const graph = await analyze(root, options);
        if (!closed) options.onGraph?.(graph);
      } while (requested && !closed);
    } catch (error) {
      if (!closed) options.onError(error);
    } finally {
      running = false;
      if (requested && !closed) void refresh();
    }
  }
  const watcher = watch(root, { recursive: true }, (event, filename) => {
    if (filename) {
      const path = filename.split(/[\\/]/).join("/");
      const config = ["tsconfig.json", "flowlens.config.json"].includes(path);
      const ignored = path
        .split("/")
        .some(
          (part) =>
            part.startsWith(".") ||
            part === "node_modules" ||
            part === "__tests__",
        );
      if (
        !config &&
        (ignored ||
          (!isSourcePath(path) && (event !== "rename" || path.includes("."))))
      )
        return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      requested = true;
      void refresh();
    }, 300);
  });
  watcher.on("error", options.onError);
  return () => {
    closed = true;
    clearTimeout(timer);
    watcher.close();
  };
}
