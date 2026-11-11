# @nazs/flowlens

Run `flowlens init` from the directory with your `tsconfig.json`. Accept the detected app entry, enter your own, or type `-` for a graph-only setup. In scripts, pass `--entry <file>` to configure the entry without a prompt.

Run `flowlens dev` to start the viewer and the app you configured during setup. The viewer URL is the only line on stdout. App output and diagnostics go to stderr. Ctrl+C stops both processes.

- `flowlens analyze [directory] [--watch]` writes the graph and instrumentation manifest.
- `flowlens dev [directory] [--entry <file>] [--port <port>]` also accepts a project path, an entry override, and a viewer port.
- `flowlens --skills` prints a Markdown guide for AI agents.
