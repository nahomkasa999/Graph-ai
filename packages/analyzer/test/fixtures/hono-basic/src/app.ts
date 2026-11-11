import { Hono as Router } from "hono";
import { notes } from "./notes/router.ts";
const app = new Router();
app.route("/notes", notes);
const dynamic = "/hidden";
app.get(dynamic, (c) => c.text("skip"));
const map = new Map();
map.get("/not-a-route");
