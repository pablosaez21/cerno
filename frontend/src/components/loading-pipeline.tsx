"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export function LoadingPipeline({ steps }: { steps: string[] }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, steps.length - 1));
    }, 2400);
    return () => window.clearInterval(interval);
  }, [steps.length]);

  return (
    <div
      className="card p-5"
      role="status"
      aria-live="polite"
    >
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text)]">
          Building your analysis
        </p>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {activeStep + 1}/{steps.length}
        </span>
      </div>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;
          return (
            <li
              key={step}
              className={`flex items-center gap-3 text-sm ${
                complete || active
                  ? "text-[var(--text)]"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                  complete
                    ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                    : active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                {complete ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : active ? (
                  <span className="size-2 rounded-full bg-current" />
                ) : (
                  <span className="size-1 rounded-full bg-current" />
                )}
              </span>
              {step}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
