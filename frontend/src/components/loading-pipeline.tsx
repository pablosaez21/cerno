"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

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
      className="rounded-[6px] border border-[#bdc9c2] bg-[#17211d] p-5 text-white"
      role="status"
      aria-live="polite"
    >
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-semibold">Building your analysis</p>
        <span className="font-mono text-xs text-[#b6c8bf]">
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
                complete || active ? "text-white" : "text-[#81938a]"
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                  complete
                    ? "border-[#75b397] bg-[#75b397] text-[#17211d]"
                    : active
                      ? "border-white"
                      : "border-[#52635b]"
                }`}
              >
                {complete ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : active ? (
                  <LoaderCircle className="animate-spin" size={13} />
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
