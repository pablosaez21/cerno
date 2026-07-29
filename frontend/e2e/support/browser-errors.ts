import { expect, type Page } from "@playwright/test";

export function captureBrowserErrors(page: Page): {
  assertNone: () => void;
} {
  const errors: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    const expectedHttpFailure = text.startsWith(
      "Failed to load resource: the server responded with a status of",
    );
    if (message.type() === "error" && !expectedHttpFailure) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`page: ${error.message}`);
  });

  return {
    assertNone() {
      expect(errors, "No severe browser console errors were expected.").toEqual(
        [],
      );
    },
  };
}
