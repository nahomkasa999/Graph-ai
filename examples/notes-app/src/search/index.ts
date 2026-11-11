import { listNotes, type Note } from "../db/notesRepo.ts";
import { demoDelay } from "../demo-latency.ts";

let index: Map<string, Note> | undefined;

function searchIndex() {
  index ??= new Map(listNotes().map((note) => [note.id, note]));
  return index;
}

export function indexNote(note: Note) {
  demoDelay(20, 60);
  searchIndex().set(note.id, note);
}

export function unindexNote(id: string) {
  searchIndex().delete(id);
}

export function searchNotes(query: string) {
  const term = query.trim().toLowerCase();
  return [...searchIndex().values()].filter((note) =>
    `${note.title} ${note.body}`.toLowerCase().includes(term),
  );
}
