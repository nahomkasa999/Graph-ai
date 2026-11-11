# @flowlens/tracer

Preload `@flowlens/tracer/register` with Node 22.18 or newer in an ESM project after analysis. The loader wraps the top-level functions listed in the instrumentation manifest. The HTTP instrumentation and function wrappers send OpenTelemetry spans to the local server in 100 ms batches.

`FLOWLENS_ROOT` defaults to the working directory, `FLOWLENS_URL` defaults to `http://127.0.0.1:4777/v1/traces`, and `FLOWLENS_DISABLE=1` disables tracing. Transform failures fall back to Node's original loader.
