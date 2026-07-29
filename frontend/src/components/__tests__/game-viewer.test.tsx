import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GameViewer } from "@/components/game-viewer";
import type { PgnAnalysis } from "@/lib/types";
import {
  pgnAnalysisFixture,
  pgnMovesFixture,
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
      data-testid="chessboard"
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

describe("GameViewer navigation", () => {
  it("starts at the first critical moment and navigates with every control", async () => {
    const user = userEvent.setup();
    render(<GameViewer result={pgnAnalysisFixture} sourcePgn={sourcePgn} />);

    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("5 / 6");
    expect(
      screen.getByRole("heading", { level: 4, name: "3. Qxe5+" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous move" }));
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("4 / 6");

    await user.click(screen.getByRole("button", { name: "Next move" }));
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("5 / 6");

    await user.click(screen.getByRole("button", { name: "Go to start" }));
    expect(screen.getByText("START POSITION")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous move" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Go to end" }));
    expect(screen.getByText("6 / 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next move" })).toBeDisabled();
  });

  it("supports keyboard boundaries and direct move-list selection", async () => {
    const user = userEvent.setup();
    render(<GameViewer result={pgnAnalysisFixture} sourcePgn={sourcePgn} />);
    const viewer = screen.getByRole("region", { name: "Game viewer" });

    fireEvent.keyDown(viewer, { key: "Home" });
    fireEvent.keyDown(viewer, { key: "ArrowLeft" });
    expect(screen.getByText("START POSITION")).toBeInTheDocument();

    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(screen.getByText("1 / 6")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nc6" }));
    expect(screen.getByText("4 / 6")).toBeInTheDocument();

    fireEvent.keyDown(viewer, { key: "End" });
    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(screen.getByText("6 / 6")).toBeInTheDocument();
  });

  it("jumps to an exact critical ply", async () => {
    const user = userEvent.setup();
    render(<GameViewer result={pgnAnalysisFixture} sourcePgn={sourcePgn} />);

    await user.click(screen.getByRole("button", { name: "Go to start" }));
    await user.click(
      screen.getByRole("button", { name: /^01.*Qxe5\+.*Blunder.*pawns$/ }),
    );

    expect(screen.getByText("5 / 6")).toBeInTheDocument();
    expect(screen.getByTestId("chessboard")).toHaveAttribute(
      "data-position",
      pgnMovesFixture[4].fen_after,
    );
  });
});

describe("GameViewer orientation and defensive states", () => {
  it.each(["white", "black"] as const)(
    "uses the player's %s orientation",
    (orientation) => {
      render(
        <GameViewer
          result={pgnAnalysisFixture}
          sourcePgn={sourcePgn}
          initialOrientation={orientation}
        />,
      );

      expect(
        screen.getByLabelText(`Board viewed from ${orientation}'s side`),
      ).toBeInTheDocument();
      expect(screen.getByTestId("chessboard")).toHaveAttribute(
        "data-orientation",
        orientation,
      );
    },
  );

  it("flips orientation without changing the current position", async () => {
    const user = userEvent.setup();
    render(
      <GameViewer
        result={pgnAnalysisFixture}
        sourcePgn={sourcePgn}
        initialOrientation="black"
      />,
    );
    const board = screen.getByTestId("chessboard");
    const position = board.getAttribute("data-position");

    await user.click(screen.getByRole("button", { name: "Flip board" }));

    expect(board).toHaveAttribute("data-orientation", "white");
    expect(board).toHaveAttribute("data-position", position);
    expect(screen.getByText("5 / 6")).toBeInTheDocument();
  });

  it("does not crash on invalid PGN and invalid FEN", () => {
    const invalidResult: PgnAnalysis = {
      ...pgnAnalysisFixture,
      moves: pgnMovesFixture.map((move) => ({
        ...move,
        fen_before: "invalid",
        fen_after: "invalid",
      })),
      critical_moments: [],
    };

    render(<GameViewer result={invalidResult} sourcePgn="invalid PGN" />);

    expect(screen.getByTestId("chessboard")).toHaveAttribute(
      "data-position",
      "start",
    );
    expect(screen.getByText("START POSITION")).toBeInTheDocument();
  });

  it("disables an out-of-range critical moment", () => {
    const result: PgnAnalysis = {
      ...pgnAnalysisFixture,
      critical_moments: [
        { ...pgnMovesFixture[0], move_number: 99, fen_after: "invalid" },
      ],
    };

    render(<GameViewer result={result} sourcePgn={sourcePgn} />);

    expect(screen.getByRole("button", { name: /99\. e4/ })).toBeDisabled();
    expect(screen.getByText("START POSITION")).toBeInTheDocument();
  });

  it("renders an empty analysis defensively", () => {
    const emptyResult: PgnAnalysis = {
      total_moves: 0,
      summary: {},
      critical_moments: [],
      phase_weaknesses: [],
      moves: [],
    };

    render(<GameViewer result={emptyResult} sourcePgn="" />);

    expect(screen.getByText("No moves are available for this game.")).toBeVisible();
    expect(screen.getByText("START POSITION")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to end" })).toBeDisabled();
  });

  it("has no basic automated accessibility violations", async () => {
    const { container } = render(
      <GameViewer result={pgnAnalysisFixture} sourcePgn={sourcePgn} />,
    );
    expect((await runAxe(container)).violations).toEqual([]);
  });
});
