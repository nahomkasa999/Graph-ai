import { expect, test } from "vitest";
import { wrap } from "../src/runtime";
import { instrumentSource } from "../src/transform";

test("wraps only the listed top-level functions and strips types", async () => {
  const source = `
    import type { Value } from "./types.ts";
    export function foo(x: number) { return x + 1; }
    export const bar = (x: number): number => x;
    export const named = function original() { return 5; };
    const ignored = () => 0;
    function container() { function foo() {} return foo(); }
  `;
  const code = await instrumentSource(
    source,
    "/project/a.ts",
    new Map([
      ["foo", "fn:a.ts#foo"],
      ["bar", "fn:a.ts#bar"],
      ["named", "fn:a.ts#named"],
    ]),
    "file:///tracer/runtime.js",
  );
  expect(code).toContain('from "file:///tracer/runtime.js"');
  expect(code).toMatch(/foo = _flowlensWrap\("fn:a.ts#foo", foo\)/);
  expect(code).toMatch(/bar = _flowlensWrap\("fn:a.ts#bar"/);
  expect(code).toContain("function original()");
  expect(code.match(/fn:a\.ts#foo/g)).toHaveLength(1);
  expect(code).not.toContain("x: number");
  expect(code).toContain("sourceMappingURL=data:");
});

test("keeps receiver, arguments, name, arity and the original errors", async () => {
  const sentinel = Error("original");
  function sample(this: { value: number }, first: number, second: number) {
    if (first < 0) throw sentinel;
    return this.value + first + second;
  }
  const wrapped = wrap("fn:a.ts#sample", sample);
  expect(wrapped.name).toBe("sample");
  expect(wrapped.length).toBe(2);
  expect(wrapped.call({ value: 3 }, 4, 5)).toBe(12);
  expect(() => wrapped.call({ value: 0 }, -1, 0)).toThrow(sentinel);
  const result = wrap("fn:a.ts#async", async (value: number) => value * 2);
  await expect(result(4)).resolves.toBe(8);
  const failure = wrap("fn:a.ts#reject", async () => {
    throw sentinel;
  });
  await expect(failure()).rejects.toBe(sentinel);
});
