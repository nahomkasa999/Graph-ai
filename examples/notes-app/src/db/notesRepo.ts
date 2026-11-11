import { z } from "zod";
import type { NoteInput } from "../notes/validate.ts";
import { db } from "./client.ts";

const Note = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Note = z.infer<typeof Note>;

export function insertNote(note: Note): Note {
  db()
    .prepare(
      "INSERT INTO notes VALUES (@id, @title, @body, @createdAt, @updatedAt)",
    )
    .run(note);
  return note;
}

export function findNote(id: string): Note | undefined {
  return Note.optional().parse(
    db().prepare("SELECT * FROM notes WHERE id = ?").get(id),
  );
}

export function listNotes(): Note[] {
  return Note.array().parse(
    db().prepare("SELECT * FROM notes ORDER BY createdAt DESC, id").all(),
  );
}

export function updateNote(id: string, input: NoteInput): Note | undefined {
  const row = db()
    .prepare(
      "UPDATE notes SET title = ?, body = ?, updatedAt = ? WHERE id = ? RETURNING *",
    )
    .get(input.title.trim(), input.body.trim(), new Date().toISOString(), id);
  return Note.optional().parse(row);
}

export function removeNote(id: string): boolean {
  return db().prepare("DELETE FROM notes WHERE id = ?").run(id).changes > 0;
}
