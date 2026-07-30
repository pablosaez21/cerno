"""Cross-platform quality commands for local development and CI."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
PYTHON_TARGETS = ("app", "tests", "scripts", "migrations")
INTEGRATION_COMPOSE_FILE = PROJECT_ROOT / "docker-compose.integration.yml"


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


def docker_executable() -> str:
    docker = shutil.which("docker")
    if docker is None:
        raise SystemExit("docker was not found on PATH.")
    return docker


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
    run(
        "Fast backend tests",
        [PYTHON, "-m", "pytest", "-q", "-m", "not integration"],
    )


def integration() -> None:
    run(
        "Backend integration tests",
        [PYTHON, "-m", "pytest", "-q", "-m", "integration"],
    )


def postgres() -> None:
    run(
        "PostgreSQL integration tests",
        [PYTHON, "-m", "pytest", "-q", "-m", "postgres"],
    )


def chroma() -> None:
    run(
        "ChromaDB integration tests",
        [PYTHON, "-m", "pytest", "-q", "-m", "chroma"],
    )


def stockfish() -> None:
    run(
        "Stockfish integration tests",
        [PYTHON, "-m", "pytest", "-q", "-m", "stockfish"],
    )


def suite() -> None:
    run("Complete backend suite", [PYTHON, "-m", "pytest", "-q"])


def coverage() -> None:
    run(
        "Backend tests with line and branch coverage",
        [
            PYTHON,
            "-m",
            "pytest",
            "-q",
            "-m",
            "not integration",
            "--cov=app",
            "--cov-branch",
            "--cov-report=term-missing",
            "--cov-report=xml:coverage.xml",
            "--cov-report=html:htmlcov",
        ],
    )


def coverage_all() -> None:
    run(
        "Complete backend suite with line and branch coverage",
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


def integration_up() -> None:
    docker = docker_executable()
    run(
        "Start isolated PostgreSQL integration service",
        [
            docker,
            "compose",
            "--project-name",
            "cerno-integration",
            "-f",
            str(INTEGRATION_COMPOSE_FILE),
            "up",
            "-d",
            "--wait",
        ],
    )


def integration_down() -> None:
    docker = docker_executable()
    run(
        "Stop isolated PostgreSQL integration service",
        [
            docker,
            "compose",
            "--project-name",
            "cerno-integration",
            "-f",
            str(INTEGRATION_COMPOSE_FILE),
            "down",
        ],
    )


def workflow() -> None:
    run(
        "GitHub Actions workflow syntax",
        [PYTHON, "scripts/validate_workflow.py"],
    )


def rag_eval() -> None:
    run(
        "RAG golden-set evaluation",
        [PYTHON, "scripts/evaluate_rag.py", "--mode", "final"],
    )


def frontend() -> None:
    npm = npm_executable()
    frontend_root = PROJECT_ROOT / "frontend"
    run("Frontend lint", [npm, "run", "lint"], frontend_root)
    run("Frontend TypeScript", [npm, "run", "typecheck"], frontend_root)
    run(
        "Frontend tests with coverage",
        [npm, "run", "test:coverage"],
        frontend_root,
    )
    run("Frontend production build", [npm, "run", "build"], frontend_root)


def frontend_tests() -> None:
    npm = npm_executable()
    run(
        "Frontend unit and component tests",
        [npm, "test"],
        PROJECT_ROOT / "frontend",
    )


def frontend_coverage() -> None:
    npm = npm_executable()
    run(
        "Frontend tests with coverage",
        [npm, "run", "test:coverage"],
        PROJECT_ROOT / "frontend",
    )


def frontend_e2e() -> None:
    npm = npm_executable()
    run(
        "Frontend browser end-to-end tests",
        [npm, "run", "test:e2e"],
        PROJECT_ROOT / "frontend",
    )


def frontend_full() -> None:
    frontend()
    frontend_e2e()


def backend() -> None:
    lint()
    format_check()
    type_check()
    coverage()
    workflow()


def all_quality() -> None:
    backend()
    frontend()


def full_quality() -> None:
    integration_up()
    try:
        lint()
        format_check()
        type_check()
        coverage_all()
        workflow()
        frontend()
        frontend_e2e()
    finally:
        integration_down()


COMMANDS = {
    "lint": lint,
    "format": format_check,
    "types": type_check,
    "tests": tests,
    "integration": integration,
    "postgres": postgres,
    "chroma": chroma,
    "stockfish": stockfish,
    "suite": suite,
    "coverage": coverage,
    "coverage-all": coverage_all,
    "integration-up": integration_up,
    "integration-down": integration_down,
    "workflow": workflow,
    "rag-eval": rag_eval,
    "backend": backend,
    "frontend": frontend,
    "frontend-tests": frontend_tests,
    "frontend-coverage": frontend_coverage,
    "frontend-e2e": frontend_e2e,
    "frontend-full": frontend_full,
    "all": all_quality,
    "full": full_quality,
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
