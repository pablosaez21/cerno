export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatNumber(value: unknown, fallback = "—") {
  return typeof value === "number" ? value.toFixed(value % 1 ? 1 : 0) : fallback;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function classificationTone(classification: string) {
  const value = classification.toLowerCase();
  if (value === "blunder")
    return "bg-[var(--error-soft)] text-[var(--error)] border-[var(--error)]";
  if (value === "mistake")
    return "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]";
  if (value === "inaccuracy")
    return "bg-[var(--primary-soft)] text-[var(--info)] border-[var(--border)]";
  return "bg-[var(--success-soft)] text-[var(--success)] border-[var(--border)]";
}
