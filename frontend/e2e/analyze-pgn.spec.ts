import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./support/browser-errors";

const pgnPath = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "critical-game.pgn",
);

test("analyzes a PGN with the real backend and Stockfish", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  const pgn = await readFile(pgnPath, "utf8");

  await page.goto("/");
  await page.getByRole("tab", { name: "Paste PGN" }).click();
  await page.getByLabel("Game notation").fill(pgn);
  await page.getByLabel("Side to coach").selectOption("white");
  await page.getByRole("button", { name: "Analyze PGN" }).click();

  await expect(
    page.getByRole("heading", { name: "E2EWhite" }),
  ).toBeVisible();
  await expect(page.getByText("Uploaded PGN")).toBeVisible();
  await expect(page.getByText(/\d{2} · Report/)).toHaveCount(0);
  await expect(page.getByText(/Board review/)).toHaveCount(0);
  await expect(page.getByText(/Training direction/)).toHaveCount(0);
  await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "So… what do we do?" }),
  ).toBeVisible();
  await expect(
    page
      .locator('section[aria-labelledby="training-direction-title"] ol')
      .getByRole("listitem")
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Phase performance" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Critical moments" }),
  ).toHaveCount(0);
  await expect(page.getByText(/^(?:Day|Week) \d+:/)).toHaveCount(0);
  const viewer = page.getByRole("region", { name: "Game viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("5 / 6", { exact: true })).toBeVisible();

  await viewer.getByRole("button", { name: "Previous move" }).click();
  await expect(viewer.getByText("4 / 6", { exact: true })).toBeVisible();
  await viewer.getByRole("button", { name: "Next move" }).click();
  await expect(viewer.getByText("5 / 6", { exact: true })).toBeVisible();

  await viewer.getByRole("button", { name: "Go to start" }).click();
  await expect(viewer.getByText("START POSITION", { exact: true })).toBeVisible();
  await viewer
    .getByRole("button", { name: /Qxe5\+.*Blunder.*pawns/ })
    .click();
  await expect(viewer.getByText("5 / 6", { exact: true })).toBeVisible();
  await expect(viewer.getByLabel("Selected board position")).toBeFocused();

  const board = viewer.getByLabel("Board viewed from white's side");
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await board.scrollIntoViewIfNeeded();
    const box = await board.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.height).toBeLessThanOrEqual(viewport.height - 100);
    expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
  }

  browserErrors.assertNone();
});
