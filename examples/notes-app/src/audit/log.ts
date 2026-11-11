import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { demoDelay } from "../demo-latency.ts";

export function logAudit(event: string, noteId: string) {
  demoDelay(2, 10);
  const file = process.env.NOTES_AUDIT ?? ".flowlens-notes/audit.jsonl";
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(
    file,
    `${JSON.stringify({ event, noteId, at: new Date().toISOString() })}\n`,
  );
}
