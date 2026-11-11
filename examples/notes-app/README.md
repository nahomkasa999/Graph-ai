# Notes demo

Run `pnpm --filter @flowlens/notes-app start` from the repository root and send requests to `http://127.0.0.1:3000/notes`. Run `pnpm --filter @flowlens/notes-app traffic` in a second terminal for a 60-second mix of successful requests and validation failures.

Set `DEMO_LATENCY=1` when starting the server to make index and audit durations easier to see. The demo adds short synchronous delays to preserve the create handler's statement order. The SQLite database and audit log live in `.flowlens-notes/` by default.
