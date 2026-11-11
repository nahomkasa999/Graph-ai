import type { Note } from "../db/notesRepo.ts";

export function toNoteDto({ id, title, body, createdAt, updatedAt }: Note) {
  return { id, title, body, createdAt, updatedAt };
}
