export const skills = `---
name: flowlens
description: Inspect a TypeScript or JavaScript backend as a code graph and correlate it with local request traces.
---

# Flowlens

- Run \`flowlens init\` once in the project directory. Choose a Node app entry to launch it with tracing, or enter \`-\` to work with the graph alone. Non-interactive setup can use \`flowlens init --entry src/index.ts\`.
- Run \`flowlens dev\` and keep the process running. Its stdout is the local viewer URL. Read stderr for diagnostics and any app output.
- Run \`flowlens analyze\` when you only need the static artifacts. It writes \`.flowlens/graph.json\` and \`.flowlens/instrument.json\`.
- Read \`/api/graph\` for graph nodes and edges and \`/api/traces\` for observed requests. Node IDs link trace spans to graph nodes. Use the graph's file and line ranges to check the source.
- Treat static edges as analyzer results. Treat spans as observations from requests the app actually received.
- Route discovery supports Hono and Express. Live tracing requires native Node ESM on Node 22.18 or later.
- Stop the viewer and its managed app with Ctrl+C. Restart after changing which functions need instrumentation.
`;
