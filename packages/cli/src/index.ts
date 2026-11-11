#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, watchProject } from "@nazs/flowlens-analyzer";
import { serveFlowlens } from "@nazs/flowlens-server";
import { Command } from "commander";
import { z } from "zod";
import manifest from "../package.json" with { type: "json" };
import { entryFor, startTracedApp, tracedCommand } from "./command";
import { initialize, readSetup } from "./setup";
import { skills } from "./skills";

const print = (message: string) => process.stdout.write(`${message}\n`);
const warn = (error: unknown) =>
  process.stderr.write(
    `flowlens: ${error instanceof Error ? error.message : String(error)}\n`,
  );

const Port = z.coerce.number().int().min(0).max(65535);
const rootPath = (directory = ".") => realpath(resolve(directory));

function waitForSignal() {
  return new Promise<void>((done) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      done();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function buildGraph(root: string, report = true) {
  const start = performance.now();
  const graph = await analyze(root, { onWarning: warn });
  if (report)
    print(
      `Analyzed ${graph.nodes.length} nodes and ${graph.edges.length} edges in ${Math.round(performance.now() - start)} ms.`,
    );
}

function watchGraph(root: string, report = true) {
  return watchProject(root, {
    onWarning: warn,
    onError: warn,
    onGraph: report
      ? (graph) =>
          print(
            `Updated graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
          )
      : undefined,
  });
}

const program = new Command()
  .name("flowlens")
  .description("Explore a TypeScript backend with live request traces")
  .version(manifest.version)
  .option("--skills", "Print Flowlens guidance for AI agents")
  .action((options: { skills?: boolean }) => {
    if (options.skills) print(skills.trimEnd());
    else program.outputHelp();
  });

program
  .command("init [directory]")
  .description("Set up Flowlens and choose an app entry for tracing")
  .option("--entry <file>", "Configure the app entry without prompting")
  .action(
    async (directory: string | undefined, options: { entry?: string }) => {
      print(await initialize(await rootPath(directory), options.entry));
    },
  );

program
  .command("analyze [directory]")
  .description("Write the graph and instrumentation manifest")
  .option("--watch", "Re-analyze after source changes")
  .action(
    async (directory: string | undefined, options: { watch?: boolean }) => {
      const root = await rootPath(directory);
      await buildGraph(root);
      if (!options.watch) return;
      const close = watchGraph(root);
      try {
        print(`Watching ${root}`);
        await waitForSignal();
      } finally {
        close();
      }
    },
  );

program
  .command("dev [directory]")
  .description("Analyze the project and serve the local viewer")
  .option("--entry <file>", "Override the app entry file")
  .option("--port <port>", "Viewer port", "4777")
  .action(
    async (
      directory: string | undefined,
      options: { entry?: string; port: string },
    ) => {
      const root = await rootPath(directory);
      const port = Port.parse(options.port);
      const setup = await readSetup(root);
      const entry = await entryFor(root, options.entry ?? setup?.entry);
      const launch = Boolean(setup?.entry);
      const viewerDir = dirname(
        fileURLToPath(import.meta.resolve("@nazs/flowlens-viewer/index.html")),
      );
      await buildGraph(root, false);
      let command: string | undefined;
      const server = await serveFlowlens(root, {
        port,
        viewerDir,
        startCommand: () => command,
        onError: warn,
      });
      let stopWatching: (() => void) | undefined;
      let stopApp: (() => Promise<void>) | undefined;
      try {
        stopWatching = watchGraph(root, false);
        if (entry) {
          if (launch) stopApp = startTracedApp(root, entry, server.port, warn);
          else command = tracedCommand(root, entry, server.port);
        }
        print(`http://127.0.0.1:${server.port}`);
        await waitForSignal();
      } finally {
        stopWatching?.();
        await stopApp?.();
        await server.close();
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  warn(error);
  process.exitCode = 1;
}
