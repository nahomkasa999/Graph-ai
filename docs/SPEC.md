# Code Flow Graph: Technical Spec v1

Nov 11, 2026 · @Nahom Kasa

Flowlens v1 is a local dev tool: run one command in a TypeScript/Node project and see the codebase as a zoomable graph, with live request traces lighting up the nodes. "Flowlens" is a working name; rename freely.

## 1. Overview

**Problem.** AI agents write most of the code, and the people shipping it no longer understand how the system works or where time goes. Existing tools draw static call graphs. None show the system at several zoom levels with live runtime data on the same nodes.

**v1 goal.** Given a TypeScript/Node backend, Flowlens does three things:

1. Builds a static graph: system, then features, then steps, then code.
2. Lets the user drill down and zoom out (like body, organ, tissue, cell).
3. Overlays live OpenTelemetry traces on the same graph, showing per-node duration and errors as requests happen.

**Non-goals for v1** (do not build these):

- Editing the graph or prompting an AI from a node.
- Generating code from the graph.
- Languages other than TypeScript/JavaScript.
- Cloud hosting, accounts, auth, or multi-user features.
- Pixel-perfect design. Clean and readable is enough.

**Success criteria** (each one is testable):

| Criterion                                   | Target                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Install to first graph on the demo app      | under 2 minutes                                                             |
| Static analysis of the demo app             | under 10 seconds                                                            |
| Zoom levels in the viewer                   | 4 (system, feature, step, code)                                             |
| Delay from request finishing to trace shown | under 500 ms                                                                |
| Demo feature "create note"                  | at least 6 steps; every step that calls a project function shows a duration |
| Test suite                                  | passes in CI on Node 22                                                     |

## 2. Architecture

Flowlens is a pnpm monorepo of six packages plus a demo app, all TypeScript (strict, ESM, Node 22). One local server ties together the static graph, the live traces and the viewer.

**Tooling:** pnpm workspaces, TypeScript strict, tsup for builds, vitest for tests, Biome for lint and format, GitHub Actions CI, MIT license.

| Package              | Purpose                                                                      | Main dependencies                          |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `@flowlens/core`     | Graph schema, shared types, ID helpers                                       | zod                                        |
| `@flowlens/analyzer` | Static analysis; writes `.flowlens/graph.json`                               | ts-morph                                   |
| `@flowlens/tracer`   | Runtime tracing: OpenTelemetry setup plus a loader that wraps step functions | @opentelemetry/sdk-node, @babel/core       |
| `@flowlens/server`   | Serves the viewer and graph, receives spans, streams events                  | hono, @hono/node-server                    |
| `@flowlens/viewer`   | Browser UI                                                                   | react, vite, @xyflow/react, elkjs, zustand |
| `@flowlens/cli`      | Commands `init`, `analyze`, `dev`                                            | commander                                  |
| `examples/notes-app` | Demo and test target                                                         | hono, better-sqlite3                       |

**Ports:** one server on port 4777 serves the viewer at `/`, the graph at `/api/graph`, an event stream at `/api/stream` (Server-Sent Events) and accepts OTLP/HTTP JSON traces at `/v1/traces`.

&#91;embedded content: architecture · 4 components, 4 data paths\]

The app's tracer sends spans to the server, which maps them to graph nodes and streams events to the viewer. The analyzer produces the graph and the list of functions the tracer wraps.

**Data flow:**

1. `flowlens analyze` reads the project's `tsconfig.json` and writes `.flowlens/graph.json`.
2. `flowlens dev` runs analyze, starts the server, and prints the command to start the user's app with tracing.
3. The user's app runs with `node --import @flowlens/tracer/register app.js`. This starts OpenTelemetry and registers the loader.
4. Each finished request exports its spans to `/v1/traces`.
5. The server maps every span to a graph node ID and pushes a normalized event over `/api/stream`.
6. The viewer loads the graph once, then paints durations and errors onto nodes as events arrive.

## 3. Graph data model

The graph is a tree of containment (parent to child) plus edges for flow between siblings. Both are defined once in `@flowlens/core` as zod schemas, and every other package imports the inferred types.

**Zoom levels** (the body, organ, tissue, cell idea):

| Level | Kind       | What a node is                                  | Example                                |
| ----- | ---------- | ----------------------------------------------- | -------------------------------------- |
| 0     | `module`   | A top-level area of the codebase (folder group) | `notes`, `db`, `http`                  |
| 1     | `feature`  | One user-facing entry point (HTTP route)        | `POST /notes`                          |
| 2     | `step`     | One stage of a feature's flow, in order         | `validate input`, `insert row`         |
| 3     | `function` | The actual function with its source range       | `createNote` in `src/notes/service.ts` |

**IDs must be stable across re-analysis** so the viewer keeps layout and live stats. Format: `<kind>:<relative posix path>#<name>`, for example `fn:src/notes/service.ts#createNote`. Features use `feat:POST /notes`. Modules use `mod:src/notes`.

**Schema** (`packages/core/src/graph.ts`):

```ts
import { z } from "zod";

export const NodeKind = z.enum(["module", "feature", "step", "function"]);

export const GraphNode = z.object({
  id: z.string(),
  kind: NodeKind,
  level: z.number().int().min(0).max(3),
  label: z.string(),
  parentId: z.string().nullable(),
  file: z.string().optional(), // relative posix path
  range: z.object({ startLine: z.number(), endLine: z.number() }).optional(),
  meta: z.record(z.string(), z.unknown()).default({}), // route method/path, db table, etc.
});

export const EdgeKind = z.enum(["flow", "calls", "depends"]);

export const GraphEdge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: EdgeKind,
  order: z.number().int().optional(), // position in a feature's flow
});

export const Graph = z.object({
  version: z.literal(1),
  generatedAt: z.string(), // ISO timestamp
  root: z.string(), // project root, absolute
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});

export const SpanEvent = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  nodeId: z.string().nullable(), // null when no node matched (section 5.3 adds featureId and stepId, both string | null)
  name: z.string(),
  startMs: z.number(), // epoch ms
  durationMs: z.number(),
  status: z.enum(["ok", "error"]),
  attributes: z.record(z.string(), z.unknown()).default({}),
});
```

**Rules:**

- `flow` edges connect steps of one feature in execution order. `calls` edges connect functions. `depends` edges connect modules.
- Every node except the module roots has a `parentId`. Containment is the only hierarchy.
- `graph.json` must validate against `Graph` before it is written. A failing validation is a bug, not a warning.

## 4. Static analyzer

`@flowlens/analyzer` exports `analyze(projectRoot, options): Promise<Graph>` and writes two files: `.flowlens/graph.json` and `.flowlens/instrument.json` (the list of functions the tracer will wrap, see section 5). It uses one shared ts-morph `Project` built from the target's `tsconfig.json`. It skips `node_modules`, `*.d.ts`, and test files (`*.test.ts`, `*.spec.ts`, `__tests__`).

**Algorithm, in order:**

1. **Modules.** Each directory directly under `src/` becomes a `module` node (level 0). Files directly in `src/` go to a module named `root`. A `flowlens.config.json` may override this with a `modules` map of glob to name.
2. **Functions.** Every top-level function declaration and every top-level `const name = (...) => ...` or function expression in a project file becomes a `function` node (level 3). Its `parentId` is its module. Class methods are out of scope for v1.
3. **Features.** Find route registrations (table below). Each one becomes a `feature` node (level 1) whose parent is the module of the file that registers it. Its `meta` holds `method`, `path` and the handler's function ID.
4. **Steps.** Walk the handler body statement by statement, in source order, top level only (no descent into `if`, loops or callbacks in v1). Each statement that contains a call becomes a `step` node (level 2), parented to the feature, with a `flow` edge from the previous step and an `order` number. Resolve the callee with the type checker:
   - Callee is a project function: set `meta.functionId`.
   - Callee is a member of an imported package: set `meta.external` to the package name.
   - Callee name is `json`, `send`, `text` or `redirect` inside a return statement. If that return also calls a project function, set meta.functionId to the first one. Calls rooted at a handler parameter (such as c.req.json()) are never steps; they count as part of receive request. Label that step "send response".
   - The first step is always "receive request" (no function).
   - Label = callee name split from camelCase into lowercase words, for example `insertNote` becomes "insert note".
5. **Call edges.** For every project function, add a `calls` edge to each project function it calls directly (resolved by the type checker, not by name).
6. **Module edges.** If a file in module A imports a file in module B, add one `depends` edge A to B.
7. **Output.** Sort nodes and edges by ID so output is deterministic, validate with `Graph.parse`, then write both files.

**Route patterns supported in v1:**

| Framework | Pattern                                                         | Notes                                                   |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| Hono      | `app.get("/x", handler)`, also `post`, `put`, `patch`, `delete` | `app.route("/prefix", sub)` is resolved one level deep  |
| Express   | `app.get("/x", handler)` and `router.get(...)`                  | `app.use("/prefix", router)` is resolved one level deep |

The handler is the last argument. It may be an inline function or an identifier that resolves to a project function. Routes with a non-literal path are skipped and logged as a warning.

**Watch mode.** `analyze --watch` re-runs on file changes with a 300 ms debounce and notifies the server so the viewer reloads the graph.

**Tests:**

- Fixture projects in `packages/analyzer/test/fixtures/` (`hono-basic`, `express-basic`) with snapshot tests of the resulting graph.
- A test that running twice on the same input produces byte-identical output.
- A test on `examples/notes-app` asserting that `feat:POST /notes` exists and has at least 6 steps.

## 5. Runtime tracing

The tracer makes the user's app emit one OpenTelemetry span per request and one per instrumented project function, ships them to the Flowlens server, and the server maps each span onto a graph node. The tracer must never break the user's app: every internal error is caught and logged once with `console.warn`, and spans are dropped silently if the server is unreachable.

### 5.1 Starting the tracer

`node --import @flowlens/tracer/register src/index.ts` does three things:

1. Starts the OpenTelemetry `NodeSDK` with the HTTP auto-instrumentations and an OTLP/HTTP **JSON** exporter pointed at `FLOWLENS_URL` (default `http://127.0.0.1:4777/v1/traces`). Use a `BatchSpanProcessor` with `scheduledDelayMillis: 100` so traces reach the viewer within 500 ms.
2. Reads `.flowlens/instrument.json` from `FLOWLENS_ROOT` (default: current directory).
3. Registers an ESM loader with `module.register`.

Environment variables: `FLOWLENS_URL`, `FLOWLENS_ROOT`, `FLOWLENS_DISABLE=1` (turns everything off).

**Supported runtime in v1:** ESM only, Node 22.18 or newer (so `.ts` files run natively), or plain `.js` ESM. CommonJS and `tsx` are out of scope.

### 5.2 The loader and the wrapper

The loader hooks `load`. For a file listed in `instrument.json` it reads the source, transforms it with Babel (`@babel/preset-typescript` plus a small Flowlens plugin, inline source maps on), and returns it with `format: "module"` and `shortCircuit: true`. Other files pass through untouched.

The plugin matches entries by **relative file path and function name** (not line number, because lines drift). It handles only top-level code:

- `function foo() {}` and `export function foo() {}`: insert `foo = __fl.wrap("<nodeId>", foo);` right after the declaration.
- `const foo = () => {}` or `const foo = function () {}`: replace the initializer with `__fl.wrap("<nodeId>", <original initializer>)`.
- Add one import at the top of the file for `__fl`, using the **absolute file URL** of the tracer's runtime module, so the target project does not need `@flowlens/tracer` as a dependency.

`__fl.wrap(nodeId, fn)` returns a function that:

- Calls `tracer.startActiveSpan` with attributes `flowlens.node`, `code.filepath` and `code.function`.
- Preserves `this`, all arguments, and the original function's `name` and `length`.
- Handles both sync and Promise results: ends the span on return or on settle.
- On a throw or rejection: records the exception, sets span status to error, ends the span, and rethrows the original error unchanged.

### 5.3 Mapping spans to nodes (server side)

The server converts every OTLP span into a `SpanEvent` (section 3). Add two fields to that schema: `featureId` and `stepId`, both `string | null`. Mapping rules, applied in order:

1. **Function span.** If the span has attribute `flowlens.node`, set `nodeId` to it. Then find its trace's feature (rule 2) and set `stepId` to the first step of that feature whose `meta.functionId` equals `nodeId` and that has not yet been used in this trace.
2. **Request span.** If the span is kind SERVER and has `http.request.method` and a path (`url.path`, or `http.target` on older versions), match method and path against the `feature` nodes. Convert route paths like `/notes/:id` to regexes. Try static routes before parameterized ones. On a match, set `nodeId` and `featureId` to the feature.
3. **No match.** Set `nodeId` to `null`. The viewer lists these as "unmapped" in the trace panel and never hides them.

A trace is complete when its root span (no parent) arrives. The server then emits `trace-complete`.

### 5.4 Server API

| Route             | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `GET /api/graph`  | Current `graph.json`                            |
| `POST /v1/traces` | OTLP/HTTP JSON receiver                         |
| `GET /api/stream` | Server-Sent Events, event types below           |
| `GET /api/traces` | Last 200 traces (ring buffer), for page reloads |
| `GET /api/stats`  | Per-node stats                                  |

Also: `GET /api/source?file=<relative path>&start=<line>&end=<line>` returns those lines of one project file as JSON `{ "lines": string[] }`. It must refuse any path that resolves outside the project root (section 9).

SSE event types: `span` (a `SpanEvent`), `trace-complete` (`traceId`, `featureId`, `durationMs`), `stats` (per-node map, debounced to at most one per 200 ms), `graph-updated` (no payload; the viewer refetches `/api/graph`).

**Stats** per node over a rolling window of the last 100 spans: `count`, `errorCount`, `p50Ms`, `p95Ms`, `lastMs`. The server computes them, so a page reload keeps them.

The server binds to `127.0.0.1` only. No auth in v1, and no CORS headers.

**Known limitation to document in the README:** a step that calls only an external package function (no project function) has no span, so it shows no duration. Steps that call project functions do.

## 6. Viewer UI

`@flowlens/viewer` is a React + Vite single-page app built with `@xyflow/react` (React Flow) for the canvas, `elkjs` for automatic layout, and `zustand` for state. The server serves its production build at `/`. It talks only to the API in section 5.4.

**Screen layout:**

- **Canvas (center):** the graph at the current focus.
- **Breadcrumb (top):** the path from the system down to the focus, for example `System > notes > POST /notes`. Each crumb is clickable and zooms out to it.
- **Detail panel (right):** details of the selected node (below).
- **Trace list (bottom):** the latest 20 traces with feature, duration and status. Clicking one replays it on the canvas.

**Drill-down behavior** (the core of the product):

1. The canvas always shows the children of one focus node. At the start the focus is the root, so it shows all level-0 modules and their `depends` edges.
2. Double-click a node, or select it and press Enter, to make it the focus. The canvas then shows its children (a module shows its features, a feature shows its steps in `flow` order, a step shows its function and that function's `calls` neighbors).
3. Escape, or a breadcrumb click, goes back up. The transition is animated: the focus node expands to fill the canvas while its children fade in.
4. **Shift-click** on a node expands it in place, showing its children nested inside it without changing the focus. Shift-click again collapses it. This lets the user see several levels at once.
5. The URL hash mirrors the focus (`#/feat:POST%20/notes`) so a view can be shared and the back button works.

**Layout:** `elkjs` layered layout, direction left to right. Features and steps follow `order`. Cache node positions by node ID so re-analysis does not reshuffle the canvas.

**Live overlay.** Every node with stats shows a small badge: `p50Ms` and `count`. Color by `p95Ms` relative to the slowest sibling: neutral, then amber above 50%, then red above 80%. A node with errors in the last 100 spans shows a red dot.

When a `span` event arrives, the node pulses once (a 600 ms CSS animation) and the edge into it animates. A completed trace can be **replayed**: spans play back in start-time order, with the real gaps scaled down so a 2-second trace replays in about 2 seconds.

**Detail panel contents:**

- Label, kind, and file with line range.
- Stats: count, p50, p95, last, errors.
- For a `function` node, the source code (read-only, syntax highlighted; fetched from `GET /api/source?file=...&start=...&end=...`, which the server must restrict to files inside the project root).
- For a feature, a bar showing how total duration splits across its steps in the selected trace.

**Empty and error states:** no traces yet shows the exact command to start the app with tracing; server disconnected shows a banner and auto-reconnects the stream with backoff.

**Keyboard:** Enter to drill in, Escape to go up, `/` to search nodes by label (fuzzy, jumps focus), arrow keys to move selection.

**Not in v1:** editing, dragging nodes to save custom positions, dark/light theme toggle (follow system), mobile layout.

## 7. Demo app

`examples/notes-app` is a plain notes CRUD API (not a to-do list). It is the test target for every package and the app shown in the demo GIF, so its code must be clean, small and shaped so the graph looks good. Stack: Hono with `@hono/node-server`, `better-sqlite3`, ESM, `.ts` run natively on Node 22.18+.

**Layout:**

```text
examples/notes-app/
  package.json            # type: module; scripts: start, start:traced, traffic
  tsconfig.json
  src/
    index.ts              # starts the server on port 3000
    app.ts                # builds the Hono app, mounts routers
    notes/routes.ts       # GET/POST /notes, GET/PUT/DELETE /notes/:id
    notes/validate.ts     # validateNoteInput, normalizeNote
    notes/dto.ts          # toNoteDto
    db/client.ts          # opens SQLite, creates the schema
    db/notesRepo.ts       # insertNote, findNote, listNotes, updateNote, removeNote
    search/index.ts       # indexNote, searchNotes (GET /search?q=)
    audit/log.ts          # logAudit (appends a line to a log file)
  scripts/traffic.ts      # sends a mixed stream of requests for demos
```

**The `POST /notes` handler must have exactly this shape** (one project function call per statement, in this order), because the analyzer and the success criteria depend on it:

```ts
notes.post("/", async (c) => {
  const body = await c.req.json();
  const input = validateNoteInput(body); // throws a 400 error if title is empty
  const note = normalizeNote(input); // trims, defaults, adds id and timestamps
  const saved = insertNote(note); // SQLite insert
  indexNote(saved); // updates an in-memory search index
  logAudit("note.created", saved.id); // appends to a log file
  return c.json(toNoteDto(saved), 201);
});
```

Expected graph for this route: a feature `feat:POST /notes` with these steps in order: receive request, validate note input, normalize note, insert note, index note, log audit, send response. That is 7 steps; 6 of them call project functions and so show a duration.

**Latency for demos.** With `DEMO_LATENCY=1`, `indexNote` sleeps a random 20 to 60 ms and `logAudit` a random 2 to 10 ms, so the live bars visibly differ. Without it, nothing sleeps. This is a documented demo switch, not hidden behavior.

**Scripts:**

- `pnpm start`: plain run.
- `pnpm start:traced`: `node --import @flowlens/tracer/register src/index.ts`.
- `pnpm traffic`: loops for 60 seconds sending a weighted mix: 40% `POST /notes`, 25% `GET /notes`, 15% `GET /notes/:id`, 10% `PUT`, 5% `DELETE`, and 5% invalid `POST` (empty title) to produce visible errors.

**Tests:** a vitest suite covering each route (happy path and one failure). These are ordinary tests of the demo app, separate from the Flowlens end-to-end test in section 8.

## 8. Milestones and test plan

Build in this order. Each milestone ends with a commit, a green CI run, and its acceptance checks passing. Do not start the next milestone until the current one is green. Total estimate: about 14 working days.

1. **M0, scaffold (0.5 day).** Monorepo with pnpm workspaces, tsconfig base, Biome, vitest, tsup, GitHub Actions CI on Node 22.18 and 24, and `@flowlens/core` with the schemas from section 3.
   - Accept: `pnpm install && pnpm build && pnpm test` passes locally and in CI.
2. **M1, demo app (0.5 day).** `examples/notes-app` exactly as in section 7, with its tests and the traffic script.
   - Accept: its tests pass; `pnpm traffic` runs for 60 seconds with no unexpected errors.
3. **M2, analyzer (3 days).** Section 4 in full, plus the fixtures and snapshot tests.
   - Accept: on the notes app the graph has modules `notes`, `db`, `search`, `audit`; feature `feat:POST /notes` has the 7 steps listed in section 7; two runs give byte-identical files; analysis takes under 10 seconds.
4. **M3, server and tracer (3 days).** Sections 5.1 to 5.4.
   - Accept: an end-to-end test starts the server, starts the notes app with `--import @flowlens/tracer/register`, sends one `POST /notes`, then reads `/api/traces`. The trace must be mapped to `feat:POST /notes` and contain 6 spans with a non-null `stepId`. Measure delay between request completion and the `trace-complete` event; it must be under 500 ms.
5. **M4, viewer static (3 days).** Canvas, layout, drill-down, breadcrumb, shift-click expand, hash routing, search, detail panel with source.
   - Accept: a Playwright test loads the viewer against the notes-app graph, drills from the root to a function node (4 levels) and back with the breadcrumb, and asserts the URL hash at each step.
6. **M5, live overlay (2 days).** Stats badges, pulses, errors, trace list, replay, reconnect banner.
   - Accept: a Playwright test runs the traffic script and asserts that all 6 instrumented steps of `POST /notes` show a badge with a count above 0, and that an invalid request produces a red error dot.
7. **M6, CLI, docs and release prep (2 days).** `flowlens init`, `analyze`, `dev` commands; README with an animated GIF at the top, a 5-line quick start, and the limitations list; CONTRIBUTING; MIT license; `npm publish --dry-run` for each package.
   - Accept: on a fresh clone, the quick start in the README takes a new user from install to a visible graph in under 2 minutes. The analyzer also works on the `express-basic` fixture.

**Test layers:**

| Layer                   | Tool                            | Covers                                                                        |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Unit                    | vitest                          | core schemas, analyzer, span-to-node mapping, stats math, Babel plugin output |
| End-to-end (no browser) | vitest, spawning real processes | analyze, server, traced demo app, `/api/traces`                               |
| UI                      | Playwright                      | drill-down, live overlay, error states                                        |

Every bug fix adds a regression test first.

## 9. Rules for the coding agent

These rules apply to the agent building Flowlens from this spec. Copy the condensed version into `AGENTS.md` at the repo root and save this whole document as `docs/SPEC.md`.

**Working method**

- Read the entire spec before writing code. Build milestones in order (section 8). One milestone per session is best; start each session by reading `docs/SPEC.md`, `AGENTS.md`, `DECISIONS.md` and `PROGRESS.md`.
- After each milestone: run lint, typecheck and all tests; fix failures; commit with a conventional message (`feat(analyzer): ...`); push; then add an entry to `PROGRESS.md` (what is done, deviations, what is next).
- Never start a milestone while CI is red.
- If the spec is ambiguous, pick the simplest option that fits the spec, record it in `DECISIONS.md` with a one-line reason, and continue. Do not stop to ask.
- If a library API differs from what this spec assumes (ts-morph, @xyflow/react, OpenTelemetry, Node module hooks), read the current official docs, adapt, and record the deviation in `DECISIONS.md`. Check current stable versions when installing; do not guess APIs from memory.

**Code standards**

- TypeScript strict, ESM, named exports only, no default exports.
- No `any`. Use `unknown` and validate with zod at every boundary (files read, HTTP bodies, OTLP payloads).
- Files under 300 lines. Prefer small pure functions; keep I/O at the edges so logic is unit-testable.
- No `console.log` in library code. The CLI prints with a small output helper. The tracer uses `console.warn` only for its own failures.
- Only add dependencies listed in this spec. If one more is truly needed, add it and record why in `DECISIONS.md`.

**Hard constraints**

- Do not build anything listed under non-goals (section 1).
- No network calls except to `127.0.0.1`. No telemetry.
- `GET /api/source` must resolve the real path and refuse anything outside the project root (path traversal test required).
- The tracer must never throw into or crash the user's app.
- No secrets in the repo.

**Definition of done for a milestone**

1. Its acceptance checks (section 8) pass, automated wherever the section says so.
2. `pnpm lint && pnpm typecheck && pnpm test` is green locally and in CI.
3. Public functions have a short doc comment; the package README is updated.
4. No `TODO` without a matching line in `PROGRESS.md`.

**Starter prompt to give the agent for M0:**

```text
You are building the open source project in docs/SPEC.md. Read it fully, then
create AGENTS.md, DECISIONS.md and PROGRESS.md as described in section 9.
Implement milestone M0 only, run all checks, commit, push, and report what you
did and anything in the spec that was unclear.
```

For later milestones, replace "M0" with the next milestone and tell the agent to read `PROGRESS.md` first.

## 10. After v1 (do not build yet)

v1 is deliberately read-only. These are the next steps toward the full vision, in order. Do not build any of them in v1, but do not block them either: keep node IDs stable, keep `meta` open-ended, and keep `Graph.version` so the format can evolve.

1. **v2, branch and prompt.** In the viewer, the user adds a new node or branch under a feature, writes a prompt on it, and the tool sends the prompt plus the node's context (source, neighbors, recent traces) to a coding agent, which edits the code. The graph is re-analyzed afterwards and the diff is highlighted.
2. **v3, chat on the graph.** A chat panel whose context is the selected node and its live stats, so the user can ask "why is this step slow?" and get an answer grounded in real traces.
3. **v4, graph to build.** Export the full graph (features, steps, contracts, expected timings) as a spec an agent can build from end to end, then verify the result by replaying traffic and comparing the new traces to the graph.
4. **Later:** more languages (Python first), Express and Fastify coverage, class methods, non-ESM runtimes.
