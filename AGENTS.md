# Flowlens

Read docs/SPEC.md, DECISIONS.md and PROGRESS.md. Follow the milestone order and verify each milestone with lint, typecheck, build, tests and CI. Commit with a conventional message and push. Record decisions and milestone results in the corresponding documents.

Use strict ESM TypeScript and named exports. Validate boundary data with Zod, keep files under 300 lines and put I/O at the boundaries. Keep the dependency list within the spec and record additions. Keep project traffic local, resolve source paths before serving them, and isolate tracing failures from the app.
