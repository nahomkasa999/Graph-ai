<h1 align="center">Flowlens</h1>

<p align="center"><strong>Follow a request through your Node.js backend.</strong></p>

<p align="center">
  Turn a TypeScript or JavaScript project into a zoomable code graph.<br>
  Watch requests light up the functions they call, see where time goes, and replay failures.
</p>

<p align="center">
  <a href="https://github.com/nahomkasa999/Graph-ai/actions/workflows/ci.yml"><img src="https://github.com/nahomkasa999/Graph-ai/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <br>
  Node.js 22.18+ · pnpm 10 · <a href="LICENSE">MIT</a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#explore-a-request">Explore a request</a> ·
  <a href="#use-it-on-your-project">Use it on your project</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <img src="docs/demo.gif" width="900" alt="Flowlens opens the create-note route, highlights its live request trace, and shows timings for each step">
</p>

## Quick start

Clone the repo, build the workspace, and start the viewer.

```sh
git clone https://github.com/nahomkasa999/Graph-ai.git
cd Graph-ai
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm demo
```

Open [http://127.0.0.1:4777](http://127.0.0.1:4777) to see the notes app graph. If Corepack is unavailable, install pnpm 10 and run the same commands without the `corepack` prefix.

## Explore a request

1. In a second terminal at the repo root, start the traced notes app with `corepack pnpm demo:traced`.
2. In a third terminal, run `corepack pnpm demo:traffic` to generate requests for 60 seconds.
3. Open the `notes` module, then double-click `POST /notes`. Watch the request move through validation, SQLite, search indexing, and the audit log. Click a recent trace to replay it and see each step's duration.

| To do this                                        | Use this                        |
| ------------------------------------------------- | ------------------------------- |
| Drill from a module to a route, step, or function | Double-click a node             |
| Expand a node in place                            | Shift-click                     |
| Find a node by name                               | Press `/`                       |
| Move up a level                                   | Use the breadcrumb or press Esc |
| Inspect source or timings                         | Click a node                    |

The graph refreshes as source files change. Live OpenTelemetry spans add durations and error markers to the graph. Nodes show icons for detected technologies such as Pinecone, SQLite, PostgreSQL, and Redis. To make the search indexing and audit steps easier to see in the demo, start the traced app with `DEMO_LATENCY=1`.

## Use it on your project

After the 0.2.0 npm release, run these from your project's root.

```sh
npx @nazs/flowlens@0.2.0 init
npx @nazs/flowlens@0.2.0 dev
```

Choose your Node app entry during `init` to have `dev` start it with tracing. Enter `-` to explore the graph on its own. Open the URL printed by `dev`. Stop the viewer and its managed app with Ctrl+C. Restart after adding or renaming an instrumented function.

To try these commands from a built clone, replace `npx @nazs/flowlens@0.2.0` with `node /path/to/Graph-ai/packages/cli/dist/index.js`. Use `--skills` to print a guide for an AI coding agent.

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `init [project]`    | Choose an app entry and save the project setup                      |
| `analyze [project]` | Write `.flowlens/graph.json` and `.flowlens/instrument.json`        |
| `dev [project]`     | Start the viewer, watch source files, and launch the configured app |

## Supported in v1

- **Routes.** Hono and Express registrations with literal paths and one level of router mounts. The analyzer reads top-level handler statements. Class methods, nested callbacks, and dynamic routes are outside this scope.
- **Tracing.** Native Node ESM with TypeScript or JavaScript. Steps that only call an external package display no duration.
- **Storage.** The viewer and OTLP receiver share a port on `127.0.0.1`. Traces and rolling stats live in memory until the local server stops.

## Contributing

The pnpm workspace contains the CLI, analyzer, tracer, server, viewer, and shared graph contracts. The viewer uses ELK.js for layered layout. [Contributor guide](CONTRIBUTING.md) · [Technical spec](docs/SPEC.md) · [Design decisions](DECISIONS.md) · [Milestone progress](PROGRESS.md) · [ELK.js](https://github.com/kieler/elkjs)
