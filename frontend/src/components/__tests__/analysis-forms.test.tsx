import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnalyzeLichessForm,
  AnalyzePgnForm,
} from "@/components/analysis-forms";
import { runAxe } from "@/test/a11y";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

describe("AnalyzeLichessForm", () => {
  beforeEach(() => {
    navigation.push.mockReset();
  });

  it("renders labeled defaults and blocks an empty submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <AnalyzeLichessForm onSubmit={onSubmit} isLoading={false} />,
    );

    expect(screen.getByLabelText("Lichess username")).toBeRequired();
    expect(screen.getByRole("button", { name: "View profile" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Analyze games" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect((await runAxe(container)).violations).toEqual([]);
  });

  it("submits trimmed values and exposes the existing options", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AnalyzeLichessForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText("Lichess username"), "  Player42  ");
    await user.click(screen.getByText("Analysis settings"));
    await user.selectOptions(screen.getByLabelText("Recent games"), "2");
    await user.selectOptions(screen.getByLabelText("Engine depth"), "10");
    await user.click(
      screen.getByRole("checkbox", { name: /Save analysis/ }),
    );
    await user.click(screen.getByRole("button", { name: "Analyze games" }));

    expect(onSubmit).toHaveBeenCalledWith({
      username: "Player42",
      limit: 2,
      depth: 10,
      save: false,
    });
  });

  it("opens the encoded player profile and disables actions while loading", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <AnalyzeLichessForm onSubmit={onSubmit} isLoading={false} />,
    );
    await user.type(
      screen.getByLabelText("Lichess username"),
      "Player Name/42",
    );
    await user.click(screen.getByRole("button", { name: "View profile" }));
    expect(navigation.push).toHaveBeenCalledWith("/player/Player%20Name%2F42");

    rerender(<AnalyzeLichessForm onSubmit={onSubmit} isLoading />);
    expect(screen.getByRole("button", { name: "Analyzing games" })).toBeDisabled();
  });
});

describe("AnalyzePgnForm", () => {
  it("requires PGN and submits a trimmed request", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <AnalyzePgnForm onSubmit={onSubmit} isLoading={false} />,
    );

    await user.click(screen.getByRole("button", { name: "Analyze PGN" }));
    expect(onSubmit).not.toHaveBeenCalled();

    const notation = screen.getByLabelText("Game notation");
    await user.click(notation);
    await user.paste('  [Event "Test"]\n\n1. e4 *  ');
    await user.click(screen.getByText("Analysis settings"));
    await user.selectOptions(screen.getByLabelText("Engine depth"), "6");
    await user.click(screen.getByRole("button", { name: "Analyze PGN" }));

    expect(onSubmit).toHaveBeenCalledWith({
      pgn: '[Event "Test"]\n\n1. e4 *',
      depth: 6,
    });
    expect((await runAxe(container)).violations).toEqual([]);
  });

  it("disables its submit action while loading", () => {
    render(<AnalyzePgnForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByRole("button", { name: "Analyzing PGN" })).toBeDisabled();
  });
});
