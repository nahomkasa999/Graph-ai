import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { toNoteDto } from "./notes/dto.ts";
import { notes } from "./notes/routes.ts";
import { searchNotes } from "./search/index.ts";

export const app = new Hono();

app.route("/notes", notes);

app.get("/search", (c) => {
  const q = c.req.query("q");
  if (!q?.trim())
    throw new HTTPException(400, { message: "A search query is required" });
  const results = searchNotes(q);
  return c.json(results.map(toNoteDto));
});

app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return c.json({ error: "Invalid JSON" }, 400);
  return c.json({ error: "Internal server error" }, 500);
});
