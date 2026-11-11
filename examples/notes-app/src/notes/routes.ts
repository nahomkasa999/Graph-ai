import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logAudit } from "../audit/log.ts";
import {
  findNote,
  insertNote,
  listNotes,
  removeNote,
  updateNote,
} from "../db/notesRepo.ts";
import { indexNote, unindexNote } from "../search/index.ts";
import { toNoteDto } from "./dto.ts";
import { normalizeNote, validateNoteInput } from "./validate.ts";

export const notes = new Hono();

notes.get("/", (c) => c.json(listNotes().map(toNoteDto)));

notes.post("/", async (c) => {
  const body = await c.req.json();
  const input = validateNoteInput(body);
  const note = normalizeNote(input);
  const saved = insertNote(note);
  indexNote(saved);
  logAudit("note.created", saved.id);
  return c.json(toNoteDto(saved), 201);
});

notes.get("/:id", (c) => {
  const note = findNote(c.req.param("id"));
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  return c.json(toNoteDto(note));
});

notes.put("/:id", async (c) => {
  const body = await c.req.json();
  const input = validateNoteInput(body);
  const note = updateNote(c.req.param("id"), input);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  indexNote(note);
  logAudit("note.updated", note.id);
  return c.json(toNoteDto(note));
});

notes.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (!removeNote(id))
    throw new HTTPException(404, { message: "Note not found" });
  unindexNote(id);
  logAudit("note.deleted", id);
  return c.body(null, 204);
});
