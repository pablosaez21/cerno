import { http, HttpResponse, delay } from "msw";
import { describe, expect, it } from "vitest";
import {
  analyzeLichessUser,
  analyzePgn,
  buildApiUrl,
  getPlayerAnalyses,
  getWeaknessProfile,
  normalizeApiBaseUrl,
} from "@/lib/api";
import {
  analysisHistoryFixture,
  coachAnalysisFixture,
  pgnAnalysisFixture,
  weaknessProfileFixture,
} from "@/test/fixtures";
import { server } from "@/test/server";

const API_BASE_URL = "http://localhost:8000";

describe("API URL construction", () => {
  it("normalizes trailing slashes and leading request slashes", () => {
    expect(normalizeApiBaseUrl(" https://api.example.test/// ")).toBe(
      "https://api.example.test",
    );
    expect(buildApiUrl("games/analyze", "https://api.example.test/")).toBe(
      "https://api.example.test/games/analyze",
    );
  });

  it("URL-encodes player path segments", async () => {
    let requestedPath = "";
    server.use(
      http.get(`${API_BASE_URL}/users/:username/analyses`, ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        return HttpResponse.json(analysisHistoryFixture);
      }),
    );

    await getPlayerAnalyses("Player Name/42");

    expect(requestedPath).toBe("/users/Player%20Name%2F42/analyses");
  });
});

describe("API requests and valid responses", () => {
  it("serializes the PGN analysis request", async () => {
    let body: unknown;
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(pgnAnalysisFixture);
      }),
    );

    const result = await analyzePgn({ pgn: "1. e4 e5 *", depth: 8 });

    expect(body).toEqual({ pgn: "1. e4 e5 *", depth: 8 });
    expect(result.moves).toHaveLength(6);
    expect(result.moves[0].mover_color).toBe("white");
  });

  it("serializes the complete Lichess request", async () => {
    let body: unknown;
    server.use(
      http.post(`${API_BASE_URL}/coach/analyze-user`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(coachAnalysisFixture);
      }),
    );

    const result = await analyzeLichessUser({
      username: "FixtureWhite",
      limit: 2,
      depth: 6,
      save: false,
    });

    expect(body).toEqual({
      username: "FixtureWhite",
      limit: 2,
      depth: 6,
      save: false,
    });
    expect(result.game_analyses[0].moves).toHaveLength(6);
    expect(result.diagnosis.phase_stats.opening.moves).toBe(3);
  });

  it("accepts optional fields and empty arrays from valid responses", async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/:username/weakness-profile`, () =>
        HttpResponse.json({
          ...weaknessProfileFixture,
          detected_patterns: [],
          recommended_focus: [],
          recommended_training: [],
        }),
      ),
    );

    const profile = await getWeaknessProfile("FixtureWhite");

    expect(profile.detected_patterns).toEqual([]);
    expect(profile.recommended_training).toEqual([]);
  });

  it("supports a delayed response without changing its contract", async () => {
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, async () => {
        await delay(20);
        return HttpResponse.json(pgnAnalysisFixture);
      }),
    );

    await expect(
      analyzePgn({ pgn: "1. e4 e5 *", depth: 6 }),
    ).resolves.toEqual(pgnAnalysisFixture);
  });
});

describe("API error normalization", () => {
  it.each([
    [400, "PGN is required."],
    [404, "Lichess user was not found."],
    [429, "Too many requests."],
    [500, "Analysis failed."],
  ])("surfaces a string detail for HTTP %s", async (status, detail) => {
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, () =>
        HttpResponse.json({ detail }, { status }),
      ),
    );

    await expect(
      analyzePgn({ pgn: "invalid", depth: 6 }),
    ).rejects.toThrow(detail);
  });

  it("joins FastAPI validation-array details", async () => {
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, () =>
        HttpResponse.json(
          { detail: [{ msg: "PGN is too short" }, { msg: "Depth is invalid" }] },
          { status: 422 },
        ),
      ),
    );

    await expect(
      analyzePgn({ pgn: "x", depth: 99 }),
    ).rejects.toThrow("PGN is too short. Depth is invalid");
  });

  it("normalizes non-JSON error bodies", async () => {
    server.use(
      http.post(
        `${API_BASE_URL}/games/analyze`,
        () => new HttpResponse("upstream unavailable", { status: 502 }),
      ),
    );

    await expect(
      analyzePgn({ pgn: "1. e4 *", depth: 6 }),
    ).rejects.toThrow("The analysis service returned an error (502).");
  });

  it("reports empty and invalid successful responses", async () => {
    server.use(
      http.post(
        `${API_BASE_URL}/games/analyze`,
        () => new HttpResponse(null, { status: 200 }),
      ),
    );
    await expect(
      analyzePgn({ pgn: "1. e4 *", depth: 6 }),
    ).rejects.toThrow("empty response");

    server.use(
      http.post(
        `${API_BASE_URL}/games/analyze`,
        () => new HttpResponse("not-json", { status: 200 }),
      ),
    );
    await expect(
      analyzePgn({ pgn: "1. e4 *", depth: 6 }),
    ).rejects.toThrow("invalid JSON");
  });

  it("normalizes a network failure", async () => {
    server.use(
      http.post(`${API_BASE_URL}/games/analyze`, () => HttpResponse.error()),
    );

    await expect(
      analyzePgn({ pgn: "1. e4 *", depth: 6 }),
    ).rejects.toThrow("could not reach the analysis service");
  });
});
