import { axe } from "vitest-axe";

export function runAxe(container: Element) {
  return axe(container, {
    rules: {
      // jsdom has no layout engine, so contrast requires a real browser review.
      "color-contrast": { enabled: false },
    },
  });
}
