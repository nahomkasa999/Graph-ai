import { readFile } from "node:fs/promises";
import type { LoadHook } from "node:module";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LoaderOptions, warnOnce } from "./config";
import { instrumentSource } from "./transform";

const files = new Map<string, Map<string, string>>();
let root: string | undefined;
const runtime = new URL("./runtime.js", import.meta.url).href;

export function initialize(data: unknown) {
  try {
    const options = LoaderOptions.parse(data);
    root = options.root;
    for (const { file, name, nodeId } of options.entries) {
      const entries = files.get(file) ?? new Map<string, string>();
      entries.set(name, nodeId);
      files.set(file, entries);
    }
  } catch (error) {
    warnOnce(error);
  }
}

export const load: LoadHook = async (url, context, nextLoad) => {
  if (
    root &&
    url.startsWith("file:") &&
    !context.format?.startsWith("commonjs")
  ) {
    try {
      const filename = fileURLToPath(url);
      const entries = files.get(relative(root, filename).split(sep).join("/"));
      if (entries && /\.(?:ts|mts|js|mjs)$/.test(filename)) {
        const source = await readFile(filename, "utf8");
        return {
          source: await instrumentSource(source, filename, entries, runtime),
          format: "module",
          shortCircuit: true,
        };
      }
    } catch (error) {
      warnOnce(error);
    }
  }
  return nextLoad(url, context);
};
