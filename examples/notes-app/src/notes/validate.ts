import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

const NoteInput = z.object({
  title: z.string().trim().min(1),
  body: z.string().default(""),
});

export type NoteInput = z.infer<typeof NoteInput>;

export function validateNoteInput(body: unknown): NoteInput {
  const input = NoteInput.safeParse(body);
  if (!input.success) {
    throw new HTTPException(400, {
      message: "A non-empty title and a text body are required",
    });
  }
  return input.data;
}

export function normalizeNote(input: NoteInput) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: input.title.trim(),
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now,
  };
}
