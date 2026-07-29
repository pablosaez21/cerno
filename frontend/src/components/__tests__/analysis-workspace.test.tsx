import { http, HttpResponse, delay } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
import {
  coachAnalysisFixture,
  emptyCoachAnalysisFixture,
  pgnAnalysisFixture,
  sourcePgn,
} from "@/test/fixtures";
import { runAxe } from "@/test/a11y";
import { server } from "@/test/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { position: string; boardOrientation: string };
  }) => (
    <div
      role="img"
      aria-label="Chess position"
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

const API_BASE_URL = "http://localhost:8000";

describe("AnalysisWorkspace PGN flow", () => {
  it("renders the initial Lichess mode and switches by keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(<AnalysisWorkspace />);

    expect(
      screen.getByRole("tab", { name: "01 · Lichess player" }),
    ).toHaveAttribute("aria-selected", "true");
    const pgnTab = screen.getByRole("tab", { name: "02 · Paste PGN" });
    pgnTab.focus();
    await user.keyboard("{Enter}");

    expect(pgnTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("02 · Paste PGN");
    expect((await runAxe(container)).violations).toEqual([]);
  });

  it("announces loading, disables submission and renders a PGN result", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, async () => {
        await delay(40);
        return HttpResponse.json(pgnAnalysisFixture);
      }),
    );
    render(<AnalysisWorkspace />);

    await user.click(screen.getByRole("tab", { name: "02 · Paste PGN" }));
    await user.click(screen.getByLabelText("Game notation"));
    await user.paste(sourcePgn);
    await user.click(screen.getByRole("button", { name: "Analyze PGN" }));

    expect(screen.getByRole("button", { name: "Analyzing PGN" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Building the report");
    expect(
      await screen.findByRole("heading", { name: "Game analysis" }),
    ).toBeVisible();
    expect(screen.getByText("6", { selector: "p" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Coach reading" }),
    ).toBeVisible();
    expect(
      screen.getByText(pgnAnalysisFixture.coaching.explanation),
    ).toBeVisible();
    expect(
      screen.getByRole("list", { name: "PGN coaching recommendations" }),
    ).toHaveTextContent(pgnAnalysisFixture.coaching.recommendations[0]);
    expect(screen.getByRole("region", { name: "Game viewer" })).toBeVisible();
  });

  it("shows a controlled error and supports resubmission without clearing PGN", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ detail: "Invalid PGN fixture." }, { status: 400 })
          : HttpResponse.json(pgnAnalysisFixture);
      }),
    );
    render(<AnalysisWorkspace />);

    await user.click(screen.getByRole("tab", { name: "02 · Paste PGN" }));
    const notation = screen.getByLabelText("Game notation");
    await user.click(notation);
    await user.paste(sourcePgn);
    await user.click(screen.getByRole("button", { name: "Analyze PGN" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid PGN fixture.",
    );
    expect(notation).toHaveValue(sourcePgn);

    await user.click(screen.getByRole("button", { name: "Analyze PGN" }));
    expect(
      await screen.findByRole("heading", { name: "Game analysis" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not mutate a result merely by switching input modes", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace />);
    await user.click(screen.getByRole("tab", { name: "02 · Paste PGN" }));
    await user.click(screen.getByLabelText("Game notation"));
    await user.paste(sourcePgn);
    await user.click(screen.getByRole("button", { name: "Analyze PGN" }));
    await screen.findByRole("heading", { name: "Game analysis" });

    await user.click(screen.getByRole("tab", { name: "01 · Lichess player" }));

    expect(screen.getByLabelText("Lichess username")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Game analysis" })).toBeVisible();
  });
});

describe("AnalysisWorkspace Lichess flow", () => {
  it("submits the current form contract and renders a player report", async () => {
    const user = userEvent.setup();
    let requestBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/coach/analyze-user`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(coachAnalysisFixture);
      }),
    );
    const { container } = render(<AnalysisWorkspace />);

    await user.type(
      screen.getByLabelText("Lichess username"),
      "FixtureWhite",
    );
    await user.click(screen.getByRole("button", { name: "Analyze games" }));

    expect(
      await screen.findByRole("heading", { name: "FixtureWhite" }),
    ).toBeVisible();
    expect(requestBody).toEqual({
      username: "FixtureWhite",
      limit: 3,
      depth: 8,
      save: true,
    });
    expect(screen.getByText("Pause before forcing captures and verify every opponent reply.")).toBeVisible();
    expect((await runAxe(container)).violations).toEqual([]);
  });

  it.each([
    [404, "Lichess user 'missing' was not found."],
    [429, "Lichess is temporarily limiting requests."],
    [500, "Could not complete the coach analysis."],
    [422, "No games found for Lichess user 'empty'."],
  ])("renders a recoverable HTTP %s error", async (status, detail) => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE_URL}/coach/analyze-user`, () =>
        HttpResponse.json({ detail }, { status }),
      ),
    );
    render(<AnalysisWorkspace />);
    await user.type(screen.getByLabelText("Lichess username"), "missing");
    await user.click(screen.getByRole("button", { name: "Analyze games" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByRole("button", { name: "Analyze games" })).toBeEnabled();
  });

  it("renders a valid report with no analyzed game viewer", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE_URL}/coach/analyze-user`, () =>
        HttpResponse.json(emptyCoachAnalysisFixture),
      ),
    );
    render(<AnalysisWorkspace />);
    await user.type(screen.getByLabelText("Lichess username"), "FixtureWhite");
    await user.click(screen.getByRole("button", { name: "Analyze games" }));

    await screen.findByRole("heading", { name: "FixtureWhite" });
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Game viewer" }),
      ).not.toBeInTheDocument();
    });
  });
});
