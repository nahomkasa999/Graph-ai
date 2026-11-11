import { expect, test } from "@playwright/test";

test("drills through four levels, reads source and navigates the breadcrumb", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const card = (label: string) =>
    page
      .locator(".react-flow__node")
      .filter({ has: page.getByText(label, { exact: true }) })
      .first();
  await page.goto("/");
  await expect(page).toHaveURL(/#\/$/);
  await card("notes").dblclick();
  await expect(page).toHaveURL(/#\/mod:src\/notes$/);
  await card("POST /notes").dblclick();
  await expect(page).toHaveURL(/#\/feat:POST%20\/notes$/);
  await card("validate note input").click();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    /#\/step:POST%20\/notes%23validate%20note%20input$/,
  );
  await card("validateNoteInput").dblclick();
  await expect(page).toHaveURL(
    /#\/fn:src\/notes\/validate.ts%23validateNoteInput$/,
  );
  await expect(page.locator(".source-code")).toContainText(
    "NoteInput.safeParse",
  );
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await breadcrumb
    .getByRole("button", { name: "POST /notes", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/feat:POST%20\/notes$/);
  await page.goBack();
  await expect(page).toHaveURL(
    /#\/fn:src\/notes\/validate.ts%23validateNoteInput$/,
  );
  await breadcrumb.getByRole("button", { name: "System", exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(errors).toEqual([]);
});

test("expands a module in place and opens a fuzzy result by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.getByLabel("Code graph");
  await canvas
    .getByText("notes", { exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(canvas.getByText("POST /notes", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await page.keyboard.press("/");
  await page.getByRole("textbox", { name: "Search by label" }).fill("vldntipt");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    /#\/fn:src\/notes\/validate.ts%23validateNoteInput$/,
  );
  await expect(page.locator(".source-code")).toContainText("validateNoteInput");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/mod:src\/notes$/);
});
