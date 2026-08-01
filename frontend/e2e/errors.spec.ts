import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./support/browser-errors";

test("recovers after an invalid PGN", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/");
  await page.getByRole("tab", { name: "Paste PGN" }).click();
  const notation = page.getByLabel("Game notation");
  await notation.fill("this is not a valid PGN");
  await page.getByLabel("Side to coach").selectOption("white");
  await page.getByRole("button", { name: "Analyze PGN" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Analysis could not be completed" }),
  ).toContainText("Invalid PGN");
  await expect(notation).toHaveValue("this is not a valid PGN");
  await expect(page.getByRole("button", { name: "Analyze PGN" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Game analysis" }),
  ).not.toBeVisible();

  browserErrors.assertNone();
});
