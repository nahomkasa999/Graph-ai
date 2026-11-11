import { readFile, realpath } from "node:fs/promises";
import { createRequire, register, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { Instrumentation } from "@nazs/flowlens-core";
import { CollectorURL, warnOnce } from "./config";

if (process.env.FLOWLENS_DISABLE !== "1") {
  try {
    const root = await realpath(process.env.FLOWLENS_ROOT ?? process.cwd());
    const url = CollectorURL.parse(
      process.env.FLOWLENS_URL ?? "http://127.0.0.1:4777/v1/traces",
    );
    const entries = Instrumentation.parse(
      JSON.parse(
        await readFile(join(root, ".flowlens", "instrument.json"), "utf8"),
      ),
    );
    const [
      { NodeSDK },
      { HttpInstrumentation },
      { OTLPTraceExporter },
      { AlwaysOnSampler, BatchSpanProcessor },
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/instrumentation-http"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/sdk-trace"),
    ]);
    const sdk = new NodeSDK({
      autoDetectResources: false,
      sampler: new AlwaysOnSampler(),
      metricReaders: [],
      logRecordProcessors: [],
      serviceName: "flowlens-local",
      spanProcessors: [
        new BatchSpanProcessor({
          exporter: new OTLPTraceExporter({ url, timeoutMillis: 300 }),
          scheduledDelayMillis: 100,
          exportTimeoutMillis: 400,
        }),
      ],
      instrumentations: [
        new HttpInstrumentation({
          disableOutgoingRequestInstrumentation: true,
        }),
      ],
    });
    sdk.start();
    const require = createRequire(import.meta.url);
    require("node:http");
    require("node:https");
    syncBuiltinESMExports();
    register(new URL("./loader.js", import.meta.url), {
      data: { root, entries },
    });
  } catch (error) {
    warnOnce(error);
  }
}
