import { serve } from "@hono/node-server";
import { app } from "./app.ts";

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: Number(process.env.NOTES_PORT ?? 3000),
  },
  ({ port }) => {
    process.stdout.write(`Notes API listening at http://127.0.0.1:${port}\n`);
  },
);
