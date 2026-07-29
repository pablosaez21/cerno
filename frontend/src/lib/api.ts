import type {
  AnalysisHistory,
  CoachAnalysis,
  PgnAnalysis,
  WeaknessProfile,
} from "@/lib/types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
);

type ErrorPayload = {
  detail?: string | { msg?: string }[];
};

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function buildApiUrl(path: string, baseUrl = API_BASE_URL): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeApiBaseUrl(baseUrl)}${normalizedPath}`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
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
    const payload = await readJson(response);
    const errorPayload = isErrorPayload(payload) ? payload : {};
    const detail = Array.isArray(errorPayload.detail)
      ? errorPayload.detail
          .map((item) => item.msg)
          .filter(Boolean)
          .join(". ")
      : errorPayload.detail;

    throw new Error(
      detail || `The analysis service returned an error (${response.status}).`,
    );
  }

  const payload = await readJson(response);
  if (payload === undefined) {
    throw new Error("The analysis service returned an empty response.");
  }
  if (payload === INVALID_JSON) {
    throw new Error("The analysis service returned invalid JSON.");
  }
  return payload as T;
}

const INVALID_JSON = Symbol("invalid-json");

async function readJson(
  response: Response,
): Promise<unknown | typeof INVALID_JSON | undefined> {
  const body = await response.text();
  if (!body.trim()) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!value || typeof value !== "object" || !("detail" in value)) {
    return false;
  }

  const detail = (value as { detail?: unknown }).detail;
  return (
    typeof detail === "string" ||
    (Array.isArray(detail) &&
      detail.every(
        (item) =>
          !!item &&
          typeof item === "object" &&
          (!("msg" in item) ||
            typeof (item as { msg?: unknown }).msg === "string"),
      ))
  );
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
