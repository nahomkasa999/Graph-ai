# Progress

- M0: Workspace, core contracts and CI scaffold.
  GitHub Actions passed on Node 22.18 and 24.
- M1: Hono notes CRUD, SQLite, audit and search, route tests and the traffic script. The tracing start script resolves once M3 supplies the tracer.
  The 60-second traffic run sent 295 requests with 16 expected validation errors.
  GitHub Actions passed on Node 22.18 and 24.
- M2: Hono and Express analysis, instrument manifest, graph snapshots, deterministic output and a debounced watcher. The notes graph analyzed in 715 ms with 52 nodes and 38 edges.
  GitHub Actions passed on Node 22.18 and 24.
- M3: Node HTTP and function tracing, local server, SSE, rolling stats, source API and real-process integration tests.
  The real notes request mapped all six function steps and delivered the completion event 119 ms after the response.
  GitHub Actions passed on Node 22.18 and 24.
- M4: Production React Flow viewer with ELK layout, four focus levels, inline expansion, URL navigation, keyboard search and source inspection.
  Playwright verified four-level hash navigation, source display, browser history, inline expansion and keyboard search.
  GitHub Actions passed on Node 22.18 and 24. The browser suite passed on Node 22.18.
- M5: Live stats, node and edge pulses, error markers, recent traces, trace replay, duration breakdown and SSE reconnect.
  Chromium verified six live badges, a real validation error, trace replay, stats after reload and automatic reconnect.
  GitHub Actions passed on Node 22.18 and 24, including the live browser suite.
- M6: CLI, quick start, contributor guide, animated demo and release packaging checks.
  Added offline technology icons for Pinecone, database drivers and frameworks. Verified Pinecone detection through SDK client variables, SQLite on the demo graph and the generic database icon.
  All six npm publish dry-runs passed. Package manifests use release versions and include the MIT license.
- npm release: Moved the workspace to `@nazs` and added a manual workflow to stage the six public packages.
- 0.2.0: Added shadcn node cards with purpose and source summaries, interactive CLI setup, managed tracing, and the `--skills` guide.
