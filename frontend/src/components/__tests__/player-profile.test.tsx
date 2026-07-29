import { http, HttpResponse, delay } from "msw";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PlayerProfile } from "@/components/player-profile";
import {
  analysisHistoryFixture,
  weaknessProfileFixture,
} from "@/test/fixtures";
import { runAxe } from "@/test/a11y";
import { server } from "@/test/server";

const API_BASE_URL = "http://localhost:8000";

describe("PlayerProfile", () => {
  it("loads both profile contracts and renders saved data", async () => {
    const { container } = render(<PlayerProfile username="FixtureWhite" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading player file");
    expect(
      await screen.findByRole("heading", { level: 1, name: "FixtureWhite" }),
    ).toBeVisible();
    expect(screen.getByText("King's Pawn vs FixtureBlack")).toBeVisible();
    expect(screen.getByText("Review forcing moves")).toBeVisible();
    expect((await runAxe(container)).violations).toEqual([]);
  });

  it("shows an empty history without hiding the profile", async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/:username/analyses`, () =>
        HttpResponse.json({ ...analysisHistoryFixture, total: 0, analyses: [] }),
      ),
    );
    render(<PlayerProfile username="FixtureWhite" />);

    expect(await screen.findByText("No saved analyses")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "FixtureWhite" }),
    ).toBeVisible();
  });

  it("surfaces a load error and retries both requests", async () => {
    const user = userEvent.setup();
    let shouldFail = true;
    server.use(
      http.get(`${API_BASE_URL}/users/:username/weakness-profile`, () =>
        shouldFail
          ? HttpResponse.json({ detail: "Profile unavailable." }, { status: 500 })
          : HttpResponse.json(weaknessProfileFixture),
      ),
      http.get(`${API_BASE_URL}/users/:username/analyses`, () =>
        HttpResponse.json(analysisHistoryFixture),
      ),
    );
    render(<PlayerProfile username="FixtureWhite" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profile unavailable.",
    );
    shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "FixtureWhite" }),
    ).toBeVisible();
  });

  it("ignores a response after unmount", async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/:username/weakness-profile`, async () => {
        await delay(30);
        return HttpResponse.json(weaknessProfileFixture);
      }),
      http.get(`${API_BASE_URL}/users/:username/analyses`, async () => {
        await delay(30);
        return HttpResponse.json(analysisHistoryFixture);
      }),
    );
    const { unmount } = render(<PlayerProfile username="FixtureWhite" />);
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(screen.queryByText("FixtureWhite")).not.toBeInTheDocument();
  });
});
