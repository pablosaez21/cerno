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
  await page.getByRole("tab", { name: "02 · Paste PGN" }).click();
  await page.getByLabel("Game notation").fill(pgn);
  await page.getByRole("button", { name: "Analyze PGN" }).click();

  await expect(
    page.getByRole("heading", { name: "Game analysis" }),
  ).toBeVisible();
  const coaching = page.getByRole("region", { name: "Coach reading" });
  await expect(coaching).toContainText("Across both sides");
  const recommendations = coaching.getByRole("list", {
    name: "PGN coaching recommendations",
  });
  await expect(recommendations.getByRole("listitem")).toHaveCount(2);
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
