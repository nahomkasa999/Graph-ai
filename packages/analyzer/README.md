# @nazs/flowlens-analyzer

`analyze(root, options)` reads the project's tsconfig and returns the version 1 graph. By default it writes `.flowlens/graph.json` and `.flowlens/instrument.json`. Set `write: false` for in-memory analysis or pass `onWarning` to collect skipped-route messages.

`watchProject(root, options)` debounces changes by 300 ms and returns a cleanup function. Use `onGraph` for successful updates and `onError` to report failures. A `flowlens.config.json` file can map relative path globs to module names, for example `{"modules":{"src/notes/**":"notes"}}`.

Node metadata records imported technologies. Calls through local client variables and a direct project function call can carry the package name to a feature step.
