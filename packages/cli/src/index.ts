#!/usr/bin/env node

import { realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, watchProject } from "@nazs/flowlens-analyzer";
import { serveFlowlens } from "@nazs/flowlens-server";
import { Command } from "commander";
import { z } from "zod";
import manifest from "../package.json" with { type: "json" };
import { entryFor, tracedCommand } from "./command";

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

async function buildGraph(root: string) {
  const start = performance.now();
  const graph = await analyze(root, { onWarning: warn });
  print(
    `Analyzed ${graph.nodes.length} nodes and ${graph.edges.length} edges in ${Math.round(performance.now() - start)} ms.`,
  );
}

function watchGraph(root: string) {
  return watchProject(root, {
    onWarning: warn,
    onError: warn,
    onGraph: (graph) =>
      print(
        `Updated graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
      ),
  });
}

const program = new Command()
  .name("flowlens")
  .description("Explore a TypeScript backend with live request traces")
  .version(manifest.version);

program
  .command("init [directory]")
  .description("Create a Flowlens config")
  .action(async (directory?: string) => {
    const root = await rootPath(directory);
    const config = join(root, "flowlens.config.json");
    try {
      await writeFile(config, '{\n  "modules": {}\n}\n', { flag: "wx" });
      print(`Created ${config}`);
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        )
      )
        throw error;
      print(`Using existing ${config}`);
    }
  });

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
  .option("--entry <file>", "App entry file used in the traced start command")
  .option("--port <port>", "Viewer port", "4777")
  .action(
    async (
      directory: string | undefined,
      options: { entry?: string; port: string },
    ) => {
      const root = await rootPath(directory);
      const port = Port.parse(options.port);
      const entry = await entryFor(root, options.entry);
      const viewerDir = dirname(
        fileURLToPath(import.meta.resolve("@nazs/flowlens-viewer/index.html")),
      );
      await buildGraph(root);
      let command = tracedCommand(root, entry, port);
      const server = await serveFlowlens(root, {
        port,
        viewerDir,
        startCommand: () => command,
        onError: warn,
      });
      let stopWatching: (() => void) | undefined;
      try {
        command = tracedCommand(root, entry, server.port);
        stopWatching = watchGraph(root);
        print(`Flowlens at http://127.0.0.1:${server.port}`);
        print(`Start your app with tracing in another terminal:\n${command}`);
        await waitForSignal();
      } finally {
        stopWatching?.();
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
