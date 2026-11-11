import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { z } from "zod";
import { entryFor } from "./command";

const Setup = z.looseObject({ entry: z.string().trim().min(1).optional() });

export async function readSetup(root: string) {
  try {
    return Setup.parse(
      JSON.parse(await readFile(join(root, "flowlens.config.json"), "utf8")),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return undefined;
    throw error;
  }
}

export async function initialize(root: string, explicit?: string) {
  const existing = await readSetup(root);
  const file = join(root, "flowlens.config.json");
  const interactive = !explicit && process.stdin.isTTY && process.stderr.isTTY;
  if (!interactive && !explicit && existing) return `Using existing ${file}`;
  const settings = existing ?? { modules: {} };
  if (interactive) {
    const entry = settings.entry ?? (await entryFor(root));
    const fallback = entry ? ` [${entry}]` : "";
    const prompt = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      const answer = (
        await prompt.question(
          `App entry to start with tracing${fallback} (type - for graph only): `,
        )
      ).trim();
      explicit = answer === "-" ? undefined : answer || entry;
    } finally {
      prompt.close();
    }
  }
  if (explicit) settings.entry = await entryFor(root, explicit);
  else delete settings.entry;
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, {
    flag: existing ? "w" : "wx",
  });
  return `${existing ? "Updated" : "Created"} ${file}`;
}
