import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { z } from "zod";
import { app } from "../src/app.ts";
import { closeDb } from "../src/db/client.ts";

const temp = mkdtempSync(join(tmpdir(), "flowlens-demo-"));
const audit = join(temp, "audit.jsonl");
const Record = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});

beforeAll(() => {
  vi.stubEnv("NOTES_DB", join(temp, "notes.sqlite"));
  vi.stubEnv("NOTES_AUDIT", audit);
});

afterAll(() => {
  closeDb();
  vi.unstubAllEnvs();
  rmSync(temp, { recursive: true, force: true });
});

function write(method: string, url: string, body: unknown) {
  return app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("creates, lists, reads, updates, searches, deletes and audits notes", async () => {
  const created = await write("POST", "/notes", {
    title: " Field report ",
    body: " First ",
  });
  expect(created.status).toBe(201);
  const { id } = Record.parse(await created.json());
  const path = `/notes/${id}`;
  expect(await (await app.request("/notes")).json()).toMatchObject([
    { id, title: "Field report" },
  ]);
  expect(await (await app.request(path)).json()).toMatchObject({
    id,
    body: "First",
  });
  const updated = await write("PUT", path, { title: "Updated survey" });
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({ id, title: "Updated survey" });
  expect(await (await app.request("/search?q=SURVEY")).json()).toMatchObject([
    { id },
  ]);
  expect((await app.request(path, { method: "DELETE" })).status).toBe(204);
  expect(await (await app.request("/search?q=survey")).json()).toEqual([]);
  expect(await (await app.request("/notes")).json()).toEqual([]);
  const Event = z.object({ event: z.string(), noteId: z.string() });
  const events = readFileSync(audit, "utf8")
    .trim()
    .split("\n")
    .map((line) => Event.parse(JSON.parse(line)));
  expect(events).toEqual([
    { event: "note.created", noteId: id },
    { event: "note.updated", noteId: id },
    { event: "note.deleted", noteId: id },
  ]);
});

test("returns client errors for invalid JSON, empty titles, missing notes and empty search", async () => {
  expect(
    (await app.request("/notes", { method: "POST", body: "{" })).status,
  ).toBe(400);
  expect((await write("POST", "/notes", { title: " " })).status).toBe(400);
  expect((await app.request("/notes/missing")).status).toBe(404);
  expect(
    (await write("PUT", "/notes/missing", { title: "Missing" })).status,
  ).toBe(404);
  expect(
    (await app.request("/notes/missing", { method: "DELETE" })).status,
  ).toBe(404);
  expect((await app.request("/search")).status).toBe(400);
});
