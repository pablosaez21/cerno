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
      className="flex items-start gap-3 rounded-[8px] border border-[var(--error)] bg-[var(--error-soft)] p-4 text-sm text-[var(--error)]"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div className="flex-1">
        <p className="font-semibold">Analysis could not be completed</p>
        <p className="mt-1 leading-6">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="grid size-9 shrink-0 place-items-center rounded-[7px] border border-[var(--error)] bg-[var(--surface)] hover:bg-[var(--error-soft)]"
          title="Try again"
        >
          <RotateCcw size={16} />
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
    <div className="rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
      <Inbox className="mx-auto text-[var(--text-muted)]" size={24} />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">
        {description}
      </p>
    </div>
  );
}
