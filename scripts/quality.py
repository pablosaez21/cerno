"""Cross-platform quality commands for local development and CI."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
PYTHON_TARGETS = ("app", "tests", "scripts")


def run(label: str, command: list[str], cwd: Path = PROJECT_ROOT) -> None:
    print(f"\n==> {label}", flush=True)
    completed = subprocess.run(command, cwd=cwd, check=False)
    if completed.returncode:
        raise SystemExit(completed.returncode)


def npm_executable() -> str:
    npm = shutil.which("npm")
    if npm is None:
        raise SystemExit("npm was not found on PATH.")
    return npm


def lint() -> None:
    run(
        "Ruff lint",
        [PYTHON, "-m", "ruff", "check", *PYTHON_TARGETS],
    )


def format_check() -> None:
    run(
        "Ruff format check",
        [PYTHON, "-m", "ruff", "format", "--check", *PYTHON_TARGETS],
    )


def type_check() -> None:
    run("mypy", [PYTHON, "-m", "mypy", "app", "scripts"])


def tests() -> None:
    run("Backend tests", [PYTHON, "-m", "pytest", "-q"])


def coverage() -> None:
    run(
        "Backend tests with line and branch coverage",
        [
            PYTHON,
            "-m",
            "pytest",
            "-q",
            "--cov=app",
            "--cov-branch",
            "--cov-report=term-missing",
            "--cov-report=xml:coverage.xml",
            "--cov-report=html:htmlcov",
        ],
    )


def workflow() -> None:
    run(
        "GitHub Actions workflow syntax",
        [PYTHON, "scripts/validate_workflow.py"],
    )


def frontend() -> None:
    npm = npm_executable()
    frontend_root = PROJECT_ROOT / "frontend"
    run("Frontend lint", [npm, "run", "lint"], frontend_root)
    run("Frontend TypeScript", [npm, "run", "typecheck"], frontend_root)
    run("Frontend production build", [npm, "run", "build"], frontend_root)


def backend() -> None:
    lint()
    format_check()
    type_check()
    coverage()
    workflow()


def all_quality() -> None:
    backend()
    frontend()


COMMANDS = {
    "lint": lint,
    "format": format_check,
    "types": type_check,
    "tests": tests,
    "coverage": coverage,
    "workflow": workflow,
    "backend": backend,
    "frontend": frontend,
    "all": all_quality,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Cerno quality checks consistently on Windows, Linux, and CI."
    )
    parser.add_argument("command", choices=COMMANDS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    COMMANDS[args.command]()


if __name__ == "__main__":
    main()
