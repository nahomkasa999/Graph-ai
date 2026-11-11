import type { XYPosition } from "@xyflow/react";

const columns = 4;

export function wrapSteps(
  records: { id: string; width: number; height: number }[],
) {
  if (records.length <= columns) return undefined;
  const widths = Array.from({ length: columns }, () => 0);
  const heights: number[] = [];
  const grid = records.map((record, index) => {
    const row = Math.floor(index / columns);
    const indexInRow = index % columns;
    const column = row % 2 === 0 ? indexInRow : columns - 1 - indexInRow;
    widths[column] = Math.max(widths[column], record.width);
    heights[row] = Math.max(heights[row] ?? 0, record.height);
    return { id: record.id, row, column };
  });
  const offsets = (sizes: number[], gap: number) =>
    sizes.map((_, index) =>
      sizes.slice(0, index).reduce((offset, size) => offset + size + gap, 0),
    );
  const left = offsets(widths, 34);
  const top = offsets(heights, 46);
  const positions = new Map<string, XYPosition>();
  for (const { id, row, column } of grid)
    positions.set(id, { x: left[column], y: top[row] });
  return positions;
}

export function stepHandles(
  positions: Map<string, XYPosition>,
  source: string,
  target: string,
) {
  const from = positions.get(source);
  const to = positions.get(target);
  if (!from || !to) return {};
  if (from.y !== to.y) return { sourceHandle: "down", targetHandle: "up" };
  return from.x > to.x ? { sourceHandle: "left", targetHandle: "right" } : {};
}
