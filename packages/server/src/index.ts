import { watch } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { serve } from "@hono/node-server";
import { Graph, SourceRange } from "@nazs/flowlens-core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { decodeSpans, OtlpPayload } from "./otlp";
import { makeTraceStore } from "./traces";

const SourceQuery = z.object({
  file: z.string().min(1),
  start: z.coerce.number().int().positive(),
  end: z.coerce.number().int().positive(),
});

export interface ServerOptions {
  port?: number;
  viewerDir?: string;
  startCommand?: string | (() => string | undefined);
  onError?: (error: unknown) => void;
}

function outside(root: string, file: string) {
  const fromRoot = relative(root, file);
  return (
    isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)
  );
}

async function sourceLines(
  root: string,
  file: string,
  start: number,
  end: number,
) {
  if (
    isAbsolute(file) ||
    win32.isAbsolute(file) ||
    outside(root, resolve(root, file))
  )
    return { status: 403 as const };
  try {
    const target = await realpath(resolve(root, file));
    if (outside(root, target)) return { status: 403 as const };
    const source = await readFile(target, "utf8");
    return {
      status: 200 as const,
      lines: source.split(/\r?\n/).slice(start - 1, end),
    };
  } catch {
    return { status: 404 as const };
  }
}

const assetTypes: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  png: "image/png",
};

export async function createFlowlensApp(
  projectRoot: string,
  options: ServerOptions = {},
) {
  const root = await realpath(projectRoot);
  const graphDirectory = join(root, ".flowlens");
  const readGraph = async () =>
    Graph.parse(
      JSON.parse(await readFile(join(graphDirectory, "graph.json"), "utf8")),
    );
  const store = makeTraceStore(await readGraph());
  const app = new Hono();
  const openStreams = new Set<() => void>();

  app.get("/", async (c) => {
    if (!options.viewerDir)
      return c.text("Flowlens viewer has not been built", 503);
    try {
      let page = await readFile(join(options.viewerDir, "index.html"), "utf8");
      const command =
        typeof options.startCommand === "function"
          ? options.startCommand()
          : options.startCommand;
      if (command) {
        const value = command
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;")
          .replaceAll("<", "&lt;");
        page = page.replace(
          "<body>",
          () => `<body data-start-command="${value}">`,
        );
      }
      return c.html(page);
    } catch {
      return c.text("Flowlens viewer has not been built", 503);
    }
  });

  app.get("/assets/:file", async (c) => {
    const file = c.req.param("file");
    if (
      !options.viewerDir ||
      !/^[\w.-]+$/.test(file) ||
      file === "." ||
      file === ".."
    )
      return c.notFound();
    try {
      const asset = await readFile(join(options.viewerDir, "assets", file));
      return new Response(new Uint8Array(asset), {
        headers: {
          "content-type":
            assetTypes[file.split(".").at(-1) ?? ""] ??
            "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return c.notFound();
    }
  });

  app.get("/api/graph", (c) => c.json(store.graph()));
  app.get("/api/stats", (c) => c.json(store.stats()));
  app.get("/api/traces", (c) => c.json(store.traces()));
  app.get("/api/source", async (c) => {
    const query = SourceQuery.safeParse(c.req.query());
    if (!query.success)
      return c.json(
        { error: "Expected a relative file and line numbers" },
        400,
      );
    const { file, start, end } = query.data;
    if (!SourceRange.safeParse({ startLine: start, endLine: end }).success) {
      return c.json({ error: "The end line must follow the start line" }, 400);
    }
    const result = await sourceLines(root, file, start, end);
    if (result.status === 200) return c.json({ lines: result.lines });
    return c.json(
      {
        error:
          result.status === 403
            ? "File is outside the project"
            : "Source file not found",
      },
      result.status,
    );
  });

  app.post("/v1/traces", async (c) => {
    if (
      c.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/json"
    ) {
      return c.json({ error: "Expected OTLP/HTTP JSON" }, 415);
    }
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const parsed = OtlpPayload.safeParse(payload);
    if (!parsed.success)
      return c.json({ error: "Invalid OTLP trace data" }, 400);
    store.ingest(decodeSpans(parsed.data));
    return c.json({});
  });

  app.get("/api/stream", (c) => {
    const response = streamSSE(c, async (stream) => {
      const unsubscribe = store.subscribe(({ event, data }) => {
        void stream
          .writeSSE({ event, data: data === null ? "" : JSON.stringify(data) })
          .catch(() => {});
      });
      const heartbeat = setInterval(() => {
        void stream.write(": heartbeat\n\n").catch(() => {});
      }, 15_000).unref();
      const done = Promise.withResolvers<void>();
      openStreams.add(done.resolve);
      stream.onAbort(done.resolve);
      try {
        await stream.write(": connected\n\n");
        if (!stream.aborted) await done.promise;
      } finally {
        openStreams.delete(done.resolve);
        clearInterval(heartbeat);
        unsubscribe();
      }
    });
    response.headers.set("Connection", "close");
    return response;
  });

  return {
    app,
    graphDirectory,
    store,
    closeStreams() {
      for (const finish of openStreams) finish();
    },
    reload: async () => store.replaceGraph(await readGraph()),
  };
}

export async function serveFlowlens(
  projectRoot: string,
  options: ServerOptions = {},
) {
  const { app, graphDirectory, store, reload, closeStreams } =
    await createFlowlensApp(projectRoot, options);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(graphDirectory, (_event, file) => {
    if (file && file !== "graph.json") return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void reload().catch(options.onError ?? (() => {}));
    }, 50);
  });
  watcher.on("error", options.onError ?? (() => {}));
  const ready = Promise.withResolvers<number>();
  const server = serve(
    { fetch: app.fetch, hostname: "127.0.0.1", port: options.port ?? 4777 },
    (info) => ready.resolve(info.port),
  );
  server.once("error", ready.reject);
  try {
    const port = await ready.promise;
    server.off("error", ready.reject);
    if (options.onError) server.on("error", options.onError);
    return {
      port,
      async close() {
        clearTimeout(timer);
        watcher.close();
        closeStreams();
        store.close();
        await new Promise<void>((done) => server.close(() => done()));
      },
    };
  } catch (error) {
    watcher.close();
    store.close();
    throw error;
  }
}
