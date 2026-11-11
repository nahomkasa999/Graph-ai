# @flowlens/cli

- `flowlens init [directory]` creates a config if one does not already exist.
- `flowlens analyze [directory] [--watch]` writes the graph and instrumentation manifest. Watch mode refreshes both after source changes.
- `flowlens dev [directory] [--entry <file>] [--port <port>]` analyzes and watches the project, serves the viewer, and prints a traced start command. It defaults to port 4777 and the current directory. Use `--entry` when the project's app starts from a different file.
