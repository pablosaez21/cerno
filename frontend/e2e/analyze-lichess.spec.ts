import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./support/browser-errors";

test("analyzes a simulated Lichess game through the real internal stack", async ({
  page,
}) => {
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/");
  await page.getByLabel("Lichess username").fill("CernoE2E");
  await page.getByText("Analysis settings").click();
  await page.getByLabel("Recent games").selectOption("1");
  await page.getByLabel("Engine depth").selectOption("6");
  await page.getByRole("checkbox", { name: /Save analysis/ }).uncheck();
  await page.getByRole("button", { name: "Analyze games" }).click();

  await expect(page.getByRole("heading", { name: "CernoE2E" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("1 of 1 requested game")).toBeVisible();
  await expect(page.getByText("Temporary report · not saved")).toBeVisible();

  const viewer = page.getByRole("region", { name: "Game viewer" });
  await expect(
    viewer.getByLabel("Board viewed from black's side"),
  ).toBeVisible();
  await viewer.getByRole("button", { name: "Go to start" }).click();
  await viewer.getByRole("button", { name: "Next move" }).click();
  await expect(viewer.getByText("1 / 6", { exact: true })).toBeVisible();

  browserErrors.assertNone();
});

test("surfaces a controlled external Lichess error", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/");
  await page.getByLabel("Lichess username").fill("MissingE2E");
  await page.getByRole("button", { name: "Analyze games" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Analysis could not be completed" }),
  ).toContainText("Lichess user 'MissingE2E' was not found.");
  await expect(
    page.getByRole("button", { name: "Analyze games" }),
  ).toBeEnabled();

  browserErrors.assertNone();
});
