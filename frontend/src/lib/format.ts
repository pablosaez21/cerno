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
  if (value === "blunder") return "bg-red-50 text-[#9d3834] border-red-200";
  if (value === "mistake") return "bg-amber-50 text-[#8b561f] border-amber-200";
  if (value === "inaccuracy")
    return "bg-sky-50 text-[#306578] border-sky-200";
  return "bg-emerald-50 text-[#24624d] border-emerald-200";
}
