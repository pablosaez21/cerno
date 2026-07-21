import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex items-start gap-4 border border-[var(--error)] bg-[var(--error-soft)] p-4 sm:p-5"
      role="alert"
    >
      <span className="grid size-10 shrink-0 place-items-center border border-[var(--error)] text-[var(--error)]">
        <AlertTriangle size={20} aria-hidden="true" />
      </span>
      <div className="flex-1">
        <p className="eyebrow !text-[var(--error)]">Analysis could not be completed</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text)]">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="icon-button shrink-0"
          aria-label="Try again"
          title="Try again"
        >
          <RotateCcw size={17} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-[var(--line-strong)] bg-[var(--night-deep)] px-6 py-12 text-center">
      <Inbox className="mx-auto text-[var(--accent)]" size={28} aria-hidden="true" />
      <h2 className="display-type mt-4 text-3xl text-[var(--text-strong)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}
