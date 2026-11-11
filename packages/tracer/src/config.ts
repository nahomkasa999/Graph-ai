import { Instrumentation } from "@flowlens/core";
import { z } from "zod";

export const CollectorURL = z.url().refine(
  (value) => {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      !url.username &&
      !url.password
    );
  },
  { message: "FLOWLENS_URL must use http://127.0.0.1" },
);

export const LoaderOptions = z.object({
  root: z.string(),
  entries: Instrumentation,
});

let warned = false;

export function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  try {
    console.warn(
      "[flowlens] Tracing issue:",
      error instanceof Error ? error.message : String(error),
    );
  } catch {}
}
