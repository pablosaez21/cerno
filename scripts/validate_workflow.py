"""Validate the repository's GitHub Actions workflow structure."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = PROJECT_ROOT / ".github" / "workflows" / "quality.yml"
EXPECTED_JOBS = {"backend", "frontend", "backend-integration"}


def require_mapping(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a mapping.")
    return value


def require_steps(job: dict[str, Any], job_name: str) -> list[dict[str, Any]]:
    raw_steps = job.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        raise ValueError(f"Job '{job_name}' must define steps.")
    if not all(isinstance(step, dict) for step in raw_steps):
        raise ValueError(f"Job '{job_name}' contains an invalid step.")
    return raw_steps


def validate_workflow() -> None:
    document = yaml.load(
        WORKFLOW_PATH.read_text(encoding="utf-8"),
        Loader=yaml.BaseLoader,
    )
    root = require_mapping(document, "Workflow")
    triggers = require_mapping(root.get("on"), "Workflow triggers")
    if not {"push", "pull_request"}.issubset(triggers):
        raise ValueError("Workflow must run for pushes and pull requests.")

    jobs = require_mapping(root.get("jobs"), "Workflow jobs")
    missing_jobs = EXPECTED_JOBS.difference(jobs)
    if missing_jobs:
        raise ValueError(f"Workflow is missing jobs: {sorted(missing_jobs)}")

    run_commands: dict[str, str] = {}
    for job_name in EXPECTED_JOBS:
        job = require_mapping(jobs[job_name], f"Job '{job_name}'")
        steps = require_steps(job, job_name)
        run_commands[job_name] = "\n".join(str(step.get("run", "")) for step in steps)

    backend_commands = run_commands["backend"]
    for command in ("lint", "format", "types", "coverage"):
        if f"scripts/quality.py {command}" not in backend_commands:
            raise ValueError(f"Backend job does not run '{command}'.")

    frontend_commands = run_commands["frontend"]
    for command in ("npm run lint", "npm run typecheck", "npm run build"):
        if command not in frontend_commands:
            raise ValueError(f"Frontend job does not run '{command}'.")

    integration_job = require_mapping(
        jobs["backend-integration"],
        "Job 'backend-integration'",
    )
    services = require_mapping(
        integration_job.get("services"),
        "Backend integration services",
    )
    if "postgres" not in services:
        raise ValueError("Backend integration job must provide PostgreSQL.")

    integration_commands = run_commands["backend-integration"]
    for command in (
        "apt-get install --yes stockfish",
        "scripts/quality.py coverage-all",
    ):
        if command not in integration_commands:
            raise ValueError(f"Backend integration job does not run '{command}'.")
    if "continue-on-error" in integration_job:
        raise ValueError("Backend integration failures must not be ignored.")


def main() -> None:
    validate_workflow()
    print(f"Workflow syntax and required jobs are valid: {WORKFLOW_PATH}")


if __name__ == "__main__":
    main()
