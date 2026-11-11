import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

let connection: Database.Database | undefined;

export function db() {
  if (!connection) {
    const filename = process.env.NOTES_DB ?? ".flowlens-notes/notes.sqlite";
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    connection = new Database(filename);
    connection.exec(`CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`);
  }
  return connection;
}

export function closeDb() {
  connection?.close();
  connection = undefined;
}
