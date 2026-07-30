import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CoachResults } from "@/components/coach-results";
import { LichessGameReview } from "@/components/lichess-game-review";
import { PgnAnalysisResult } from "@/components/pgn-results";
import {
  coachAnalysisBlackFixture,
  groundedCoachAnalysisFixture,
  pgnAnalysisFixture,
  sourcePgn,
} from "@/test/fixtures";
import { runAxe } from "@/test/a11y";

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

describe("analysis result contracts", () => {
  it("keeps global game moments in the viewer and personal moments in coaching", () => {
    render(<CoachResults result={coachAnalysisBlackFixture} />);

    const viewer = screen.getByRole("region", { name: "Game viewer" });
    expect(
      within(viewer).getByRole("button", {
        name: /^01.*Qxe5\+.*Blunder.*pawns$/,
      }),
    ).toBeVisible();
    expect(
      within(viewer).getByRole("button", {
        name: /^02.*Nxe5.*Mistake.*pawns$/,
      }),
    ).toBeVisible();
    expect(viewer).toHaveAccessibleName("Game viewer");
    expect(
      within(viewer).getByLabelText("Board viewed from black's side"),
    ).toBeVisible();

    const personalHeading = screen.getByRole("heading", {
      name: "Critical moments",
    });
    const personalSection = personalHeading.closest("section");
    expect(personalSection).not.toBeNull();
    expect(within(personalSection!).getByText(/3\. Nxe5/)).toBeVisible();
    expect(within(personalSection!).queryByText(/Qxe5/)).not.toBeInTheDocument();
  });

  it("renders an accessible PGN result and board controls", async () => {
    const { container } = render(
      <PgnAnalysisResult result={pgnAnalysisFixture} sourcePgn={sourcePgn} />,
    );

    expect(screen.getByRole("heading", { name: "Game analysis" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Coach reading" })).toBeVisible();
    expect(
      screen.getByRole("list", { name: "PGN coaching recommendations" }),
    ).toHaveTextContent(pgnAnalysisFixture.coaching.recommendations[0]);
    expect(screen.getByRole("button", { name: "Go to start" })).toBeEnabled();
    expect((await runAxe(container)).violations).toEqual([]);
  });

  it("renders an accessible coaching result", async () => {
    const { container } = render(
      <CoachResults result={coachAnalysisBlackFixture} />,
    );

    expect((await runAxe(container)).violations).toEqual([]);
  });

  it("uses the complete coaching layout for an uploaded PGN", () => {
    render(
      <CoachResults
        result={coachAnalysisBlackFixture}
        source="pgn"
      />,
    );

    expect(screen.getByText("PGN report / complete")).toBeVisible();
    expect(screen.getByText("Uploaded PGN")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "View profile" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Review the board" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Phase performance" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Critical moments" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Train with intent." }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Sources" }),
    ).toBeVisible();
  });

  it("renders grounding, recommendation citations and source attribution", () => {
    render(<CoachResults result={groundedCoachAnalysisFixture} />);

    expect(screen.getByText("Corpus-grounded coaching")).toBeVisible();
    expect(screen.getByText("Theory evidence")).toBeVisible();
    expect(screen.getByText("S1 · Pawn Endings")).toBeVisible();
    expect(screen.getByText(/Wikibooks contributors/)).toHaveTextContent(
      "CC BY-SA 4.0",
    );
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute(
      "href",
      "https://example.test/pawn-endings",
    );
    expect(screen.getByRole("link", { name: "Attribution" })).toHaveAttribute(
      "href",
      "https://example.test/pawn-endings-history",
    );
    expect(screen.getByRole("link", { name: "License" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
  });

  it("keeps coaching useful when no theory evidence is available", () => {
    render(<CoachResults result={coachAnalysisBlackFixture} />);

    expect(screen.getByText("Game-analysis evidence only")).toBeVisible();
    expect(screen.getByText("Game-analysis evidence")).toBeVisible();
    expect(
      screen.getByText(/No relevant theory source was available/),
    ).toBeVisible();
    expect(screen.queryByText("Theory evidence")).not.toBeInTheDocument();
  });

  it("switches between analyzed games and updates player orientation", async () => {
    const user = userEvent.setup();
    const blackGame = coachAnalysisBlackFixture.game_analyses[0];
    const whiteGame = {
      ...blackGame,
      game_id: "fixture-white-second",
      player_color: "white" as const,
      opponent: "SecondOpponent",
    };
    render(<LichessGameReview games={[blackGame, whiteGame]} />);

    expect(
      screen.getByLabelText("Board viewed from black's side"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /SecondOpponent/ }));

    expect(
      screen.getByLabelText("Board viewed from white's side"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /SecondOpponent/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
