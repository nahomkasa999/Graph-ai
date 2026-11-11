import { resolve } from "node:path";
import { analyze } from "../packages/analyzer/dist/index.js";
import { serveFlowlens } from "../packages/server/dist/index.js";

const root = resolve("examples/notes-app");
await analyze(root);
const server = await serveFlowlens(root, {
  port: Number(process.env.FLOWLENS_TEST_PORT ?? 5401),
  viewerDir: resolve("packages/viewer/dist"),
  startCommand: "pnpm --filter @flowlens/notes-app start:traced",
});
process.once("SIGTERM", () => {
  void server.close().then(() => process.exit(0));
});
