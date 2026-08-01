# Prompt changelog

## cerno.coach.grounded_training 2.1.0 -- 2026-08-01

- Made the coaching summary connect concrete player evidence to a practical habit
  instead of repeating the weakest phase.
- Required the first theory recommendation to select exactly one supplied study as
  Cerno's personal starting point and explain why it should come first.
- Kept the existing structured output schema and single provider call.

## cerno.coach.grounded_training 2.0.0 -- 2026-07-30

- Replaced inline free-form JSON instructions with a versioned developer prompt.
- Separated deterministic analysis from untrusted player and retrieval data.
- Added bounded retrieved chunks, structured source IDs, grounding rules, and
  explicit insufficient-evidence behavior.
- Adopted the `GeneratedCoachOutput` Structured Outputs schema.
- Added deterministic citation validation and observable fallback metadata.
- Deterministic comparison: the reviewed candidate cases score `1.0` for all
  seven contract metrics; the legacy free-form output scores `0.0` for new
  schema validity while retaining `1.0` legacy usefulness.

This is a major version because the generated output contract changed. Roll
back by restoring the previous `coach.py` generation path and response contract;
do not mix output schemas across prompt versions.
