import express from "express";
import { router as items } from "./items/routes.ts";
const app = express();
app.use("/items", items);
