import { Router } from "express";
import { readItem as handler } from "./handler.ts";
export const router = Router();
router.get("/:id", handler);
