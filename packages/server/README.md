# @flowlens/server

`serveFlowlens(root, options)` starts a loopback-only HTTP server and returns its port and an async close function. It reads the generated graph and watches the graph directory for replacements. Pass `viewerDir` to serve a built viewer. `createFlowlensApp` exposes the same Hono API for tests and embedding.

The server accepts OTLP/HTTP JSON at `/v1/traces`. The viewer reads graph, source, traces and stats under `/api` and receives updates through `/api/stream`. Traces and latency samples live in memory.
