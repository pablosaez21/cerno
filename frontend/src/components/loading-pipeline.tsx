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
      className="border border-[var(--line-strong)] bg-[var(--night-deep)] p-5 sm:p-6"
      role="status"
      aria-live="polite"
    >
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <p className="display-type text-2xl text-[var(--text-strong)] sm:text-3xl">Building the report</p>
        <span className="border border-[var(--line-strong)] bg-[var(--accent-soft)] px-3 py-2 font-mono text-xs font-bold text-[var(--accent-strong)]">
          {String(activeStep + 1).padStart(2, "0")}/{String(steps.length).padStart(2, "0")}
        </span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;
          return (
            <li
              key={step}
              className={`border p-3 text-xs leading-5 ${
                complete || active
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-[var(--line)] text-[var(--muted)]"
              }`}
            >
              <span className="mb-3 flex items-center justify-between font-mono text-[10px]">
                {String(index + 1).padStart(2, "0")}
                {complete ? (
                  <Check size={14} className="text-[var(--accent)]" aria-hidden="true" />
                ) : active ? (
                  <span className="size-2 bg-[var(--accent)]" aria-hidden="true" />
                ) : null}
              </span>
              {step}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
