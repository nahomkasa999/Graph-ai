import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const notesPort = process.env.FLOWLENS_TEST_NOTES_PORT ?? "5402";
const notes = `http://127.0.0.1:${notesPort}/notes`;

test("paints all six live step badges, errors and trace replay", async ({
  page,
  request,
}) => {
  await expect
    .poll(async () => (await request.get(notes).catch(() => null))?.status())
    .toBe(200);
  await page.goto("/#/feat:POST%20/notes");
  const canvas = page.getByRole("region", { name: "Code graph" });
  await expect(
    canvas.getByText("receive request", { exact: true }),
  ).toBeVisible();
  const created = await request.post(notes, {
    data: { title: "Live browser note" },
  });
  expect(created.status()).toBe(201);
  const traffic = await promisify(execFile)(
    process.execPath,
    ["scripts/traffic.ts"],
    {
      cwd: resolve("examples/notes-app"),
      env: { ...process.env, NOTES_PORT: notesPort, TRAFFIC_SECONDS: "2" },
    },
  );
  expect(traffic.stdout).toMatch(/Sent \d+ requests/);
  const badges = canvas.getByTestId("node-stats");
  await expect(badges).toHaveCount(6);
  for (const badge of await badges.all())
    expect(Number(await badge.getAttribute("data-count"))).toBeGreaterThan(0);

  const invalid = await request.post(notes, { data: { title: "" } });
  expect(invalid.status()).toBe(400);
  const validation = canvas
    .locator(".graph-card")
    .filter({ hasText: "validate note input" });
  await expect(validation.getByTestId("node-error")).toBeVisible();
  const latest = page.getByRole("region", { name: "Recent traces" });
  await expect(
    latest.getByRole("button", { name: /Error POST \/notes/ }).first(),
  ).toBeVisible();
  await latest
    .getByRole("button", { name: /OK POST \/notes/ })
    .first()
    .click();
  await expect(
    page.getByText("Replaying trace", { exact: true }),
  ).toBeVisible();
  await expect(canvas.getByTestId("node-pulse").first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Trace duration breakdown" }),
  ).toContainText("send response");
  await page.reload();
  await expect(badges).toHaveCount(6);
  await expect(validation.getByTestId("node-error")).toBeVisible();
});

test("reconnects the event stream after a connection failure", async ({
  page,
}) => {
  await page.route("**/api/stream", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Disconnected. Reconnecting…")).toBeVisible();
  await page.unroute("**/api/stream");
  await expect(page.getByText("Disconnected. Reconnecting…")).toBeHidden({
    timeout: 8000,
  });
});

test("keeps unmapped spans visible in the trace panel", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const response = await request.get(
    `http://127.0.0.1:${notesPort}/missing-route`,
  );
  expect(response.status()).toBe(404);
  const panel = page.getByRole("region", { name: "Recent traces" });
  await panel
    .getByRole("button", { name: /^Error GET [\d<]/ })
    .first()
    .click();
  await expect(
    panel.getByRole("heading", { name: "Unmapped spans" }),
  ).toBeVisible();
});
