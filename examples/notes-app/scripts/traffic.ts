import { setTimeout } from "node:timers/promises";
import { z } from "zod";

const NoteId = z.object({ id: z.string() });
const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.NOTES_PORT ?? 3000);
const duration = z.coerce
  .number()
  .positive()
  .parse(process.env.TRAFFIC_SECONDS ?? 60);
const base = `http://127.0.0.1:${port}/notes`;
const deadline = Date.now() + duration * 1000;
const ids: string[] = [];
let sent = 0;
let expectedErrors = 0;

while (Date.now() < deadline) {
  const choice = Math.random();
  const id = ids[Math.floor(Math.random() * ids.length)];
  const method =
    choice < 0.4 || choice >= 0.95
      ? "POST"
      : choice < 0.8
        ? "GET"
        : choice < 0.9
          ? "PUT"
          : "DELETE";
  const invalid = choice >= 0.95;
  const write = method === "POST" || method === "PUT";
  const single = choice >= 0.65 && choice < 0.95 && id !== undefined;
  const actualMethod = single || method === "POST" ? method : "GET";
  const response = await fetch(single ? `${base}/${id}` : base, {
    method: actualMethod,
    ...(write && actualMethod !== "GET"
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: invalid ? "" : `Demo note ${sent + 1}`,
            body: "Created by demo traffic.",
          }),
        }
      : {}),
    signal: AbortSignal.timeout(5000),
  });
  const expected = invalid
    ? 400
    : actualMethod === "POST"
      ? 201
      : actualMethod === "DELETE"
        ? 204
        : 200;
  if (response.status !== expected)
    throw Error(
      `${actualMethod} received ${response.status}, expected ${expected}`,
    );
  if (response.status === 201) ids.push(NoteId.parse(await response.json()).id);
  else await response.text();
  if (actualMethod === "DELETE" && id) ids.splice(ids.indexOf(id), 1);
  if (invalid) expectedErrors++;
  sent++;
  await setTimeout(200);
}

process.stdout.write(
  `Sent ${sent} requests with ${expectedErrors} expected validation errors.\n`,
);
