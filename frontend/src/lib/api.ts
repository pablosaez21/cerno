import type {
  AnalysisHistory,
  CoachAnalysis,
  PgnAnalysis,
  WeaknessProfile,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

type ErrorPayload = {
  detail?: string | { msg?: string }[];
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "Cerno could not reach the analysis service. Check that the backend is running.",
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
    const detail = Array.isArray(payload.detail)
      ? payload.detail.map((item) => item.msg).filter(Boolean).join(". ")
      : payload.detail;

    throw new Error(
      detail || `The analysis service returned an error (${response.status}).`,
    );
  }

  return response.json() as Promise<T>;
}

export function analyzeLichessUser(input: {
  username: string;
  limit: number;
  depth: number;
  save: boolean;
}) {
  return apiRequest<CoachAnalysis>("/coach/analyze-user", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function analyzePgn(input: { pgn: string; depth: number }) {
  return apiRequest<PgnAnalysis>("/games/analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPlayerAnalyses(username: string) {
  return apiRequest<AnalysisHistory>(
    `/users/${encodeURIComponent(username)}/analyses`,
  );
}

export function getWeaknessProfile(username: string) {
  return apiRequest<WeaknessProfile>(
    `/users/${encodeURIComponent(username)}/weakness-profile`,
  );
}
