import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { analyze, watchProject } from "../src/index";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const demo = fileURLToPath(
  new URL("../../../examples/notes-app/", import.meta.url),
);

test.each(["hono-basic", "express-basic"])(
  "graphs the %s fixture",
  async (name) => {
    const warnings: string[] = [];
    const { nodes, edges } = await analyze(join(fixtures, name), {
      write: false,
      onWarning: (message) => warnings.push(message),
    });
    expect({ nodes, edges, warnings }).toMatchSnapshot();
  },
);

test("writes deterministic artifacts and accepts glob-based module names", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flowlens-analyzer-"));
  try {
    await cp(join(fixtures, "express-basic"), directory, { recursive: true });
    await writeFile(
      join(directory, "flowlens.config.json"),
      '{"modules":{"src/items/**":"inventory"}}',
    );
    const graph = await analyze(directory);
    expect(
      graph.nodes.find((node) => node.id === "feat:GET /items/:id")?.parentId,
    ).toBe("mod:inventory");
    const names = ["graph.json", "instrument.json"];
    const load = () =>
      Promise.all(
        names.map((name) =>
          readFile(join(directory, ".flowlens", name), "utf8"),
        ),
      );
    const first = await load();
    await analyze(directory);
    expect(await load()).toEqual(first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("watches source edits and debounces the analysis", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flowlens-watch-"));
  try {
    await cp(join(fixtures, "express-basic"), directory, { recursive: true });
    const file = join(directory, "src/items/handler.ts");
    const initial = await readFile(file, "utf8");
    const first = Promise.withResolvers<Awaited<ReturnType<typeof analyze>>>();
    const close = watchProject(directory, {
      write: false,
      onGraph: first.resolve,
      onError: first.reject,
    });
    const timer = setTimeout(
      () => first.reject(Error("No watch update")),
      6000,
    );
    try {
      await writeFile(file, `${initial}\nexport const added = () => 1;\n`);
      const graph = await first.promise;
      expect(graph.nodes.some((node) => node.label === "added")).toBe(true);
    } finally {
      clearTimeout(timer);
      close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 8000);

test("analyzes all seven create-note steps in under ten seconds", async () => {
  const started = performance.now();
  const graph = await analyze(demo, { write: false });
  expect(performance.now() - started).toBeLessThan(10_000);
  expect(
    graph.nodes
      .filter((node) => node.kind === "module")
      .map((node) => node.label),
  ).toEqual(expect.arrayContaining(["notes", "db", "search", "audit"]));
  const steps = graph.nodes
    .filter((node) => node.parentId === "feat:POST /notes")
    .sort((left, right) => Number(left.meta.order) - Number(right.meta.order));
  expect(steps.map((step) => step.label)).toEqual([
    "receive request",
    "validate note input",
    "normalize note",
    "insert note",
    "index note",
    "log audit",
    "send response",
  ]);
  expect(
    steps.filter((step) => typeof step.meta.functionId === "string"),
  ).toHaveLength(6);
}, 15_000);
