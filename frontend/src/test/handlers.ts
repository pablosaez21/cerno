import { http, HttpResponse } from "msw";
import {
  analysisHistoryFixture,
  coachAnalysisFixture,
  weaknessProfileFixture,
} from "@/test/fixtures";

const API_BASE_URL = "http://localhost:8000";

export const handlers = [
  http.post(`${API_BASE_URL}/coach/analyze-pgn`, () =>
    HttpResponse.json(coachAnalysisFixture),
  ),
  http.post(`${API_BASE_URL}/coach/analyze-user`, () =>
    HttpResponse.json(coachAnalysisFixture),
  ),
  http.get(`${API_BASE_URL}/users/:username/analyses`, () =>
    HttpResponse.json(analysisHistoryFixture),
  ),
  http.get(`${API_BASE_URL}/users/:username/weakness-profile`, () =>
    HttpResponse.json(weaknessProfileFixture),
  ),
];
