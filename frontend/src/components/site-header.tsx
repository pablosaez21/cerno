import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="wide-shell flex h-14 items-center justify-between">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.16em] text-[var(--text)]"
          aria-label="Cerno home"
        >
          CERNO
        </Link>
        <span className="hidden text-xs text-[var(--text-muted)] sm:block">
          Chess analysis and training plans
        </span>
      </div>
    </header>
  );
}
