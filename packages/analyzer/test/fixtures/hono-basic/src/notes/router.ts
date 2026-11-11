import { Hono } from "hono";
import { join } from "node:path";
import * as service from "./service.ts";
export const notes = new Hono();
notes.get("/", (c) => {
  const title = c.req.query("title");
  const key = join("notes", "title");
  const note = service.readNote(key, title);
  if (!note) service.skipNested();
  return c.json(service.toDto(note));
});
