const PHASE_LABELS: Record<string, string> = {
  opening: "Opening",
  middlegame: "Middlegame",
  endgame: "Endgame",
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function phaseLabel(value: string) {
  return PHASE_LABELS[value.toLowerCase()] ?? titleCase(value);
}

export function classificationLabel(value: string) {
  return CLASSIFICATION_LABELS[value.toLowerCase()] ?? titleCase(value);
}

export function formatNumber(value: unknown, fallback = "—") {
  return typeof value === "number" ? value.toFixed(value % 1 ? 1 : 0) : fallback;
}

export function formatPawnValue(value: unknown, fallback = "—") {
  if (typeof value !== "number") return fallback;

  const pawns = value / 100;
  const decimals = Math.abs(pawns) >= 1 ? 1 : 2;

  return pawns.toFixed(decimals);
}

export function formatEvaluation(value: unknown, fallback = "—") {
  if (typeof value !== "number") return fallback;
  if (Math.abs(value) >= 100) return value > 0 ? "+M" : "−M";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function classificationTone(classification: string) {
  const value = classification.toLowerCase();
  if (value === "blunder") return "tone tone-error";
  if (value === "mistake") return "tone tone-warning";
  if (value === "inaccuracy") return "tone tone-info";
  return "tone tone-success";
}
