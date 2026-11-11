# Decisions

- Pin the TypeScript 5 release line for compatibility with tsup declaration builds and ts-morph. Node 22.18 is the supported runtime floor.
- Keep public API notes in package READMEs to honor the repository owner's preference for code without comments.
- Use source file modification times for the analyzer's generation timestamp so repeated analysis of unchanged files yields identical bytes.
- Keep canonical functions under modules and show a step's function and call neighbors through a reference. This preserves one function ID and one containment parent even when several steps call it.
- Keep the analyzer free of runtime hooks. The loader consumes the instrument manifest, the server owns trace-to-node mapping, and the viewer reads graph and trace state through HTTP and SSE.
- Use bounded synchronous delay for the opt-in demo latency so the create handler keeps the specified one-call-per-statement shape. No delay runs by default.
- Share Zod with the demo for input, SQLite rows and traffic response validation. Use the matching SQLite type declarations for strict TypeScript.
