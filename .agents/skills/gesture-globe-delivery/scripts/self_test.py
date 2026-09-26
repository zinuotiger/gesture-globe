#!/usr/bin/env python3
"""Reproducible integration self-test for the Gesture Globe controller.

Runs only in temporary Git repositories and never touches product code in the
calling repository.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
OVERLAY_ROOT = SKILL_ROOT.parents[2]


def run(repo: Path, *args: str, expect: int = 0) -> str:
    cp = subprocess.run(
        list(args),
        cwd=repo,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if cp.returncode != expect:
        raise RuntimeError(
            f"command returned {cp.returncode}, expected {expect}: {' '.join(args)}\n{cp.stdout}"
        )
    return cp.stdout


def controller(repo: Path) -> Path:
    return repo / ".agents" / "skills" / "gesture-globe-delivery" / "scripts" / "gg.py"


def gg(repo: Path, *args: str, expect: int = 0) -> str:
    return run(repo, sys.executable, str(controller(repo)), *args, expect=expect)


def fill_task_report(path: Path, *, manual: bool = False) -> None:
    text = path.read_text(encoding="utf-8")
    replacements = {
        "**Status:** PASS | FAIL | PARTIAL | NOT_RUN": "**Status:** PASS",
        "<ISO timestamp>": "2026-09-26T10:00:00+00:00",
        "<IDs/sections>": "controller self-test",
        "**Manual gate evidence:** PASS | FAIL | NOT_REQUIRED": (
            "**Manual gate evidence:** PASS"
            if manual
            else "**Manual gate evidence:** NOT_REQUIRED"
        ),
        "| `<command>` | PASS/FAIL/NOT_RUN | `<summary or file>` |": (
            "| `controller self-test` | PASS | temporary Git repository |"
        ),
        "| <check> | PASS/FAIL/NOT_RUN | <browser/device/path> |": (
            "| controller transition | PASS | temporary Git repository |"
        ),
        "Explain why this task may or may not be marked complete.": (
            "Controller self-test criteria passed."
        ),
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def fill_milestone_report(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = text.replace("**Status:** PASS | FAIL | PARTIAL", "**Status:** PASS")
    text = text.replace("<ISO date>", "2026-09-26")
    text = text.replace(
        "| Command | Result | Notes |\n|---|---|---|",
        "| Command | Result | Notes |\n|---|---|---|\n"
        "| controller self-test | PASS | milestone lock verified |",
    )
    text = text.replace(
        "| Gate | Result | Device/browser/evidence |\n|---|---|---|",
        "| Gate | Result | Device/browser/evidence |\n|---|---|---|\n"
        "| no external gate in self-test | PASS | temporary repository |",
    )
    text = text.replace(
        "State whether the next milestone may begin and why.",
        "MS-0 controller gate passed in the temporary integration test.",
    )
    path.write_text(text, encoding="utf-8")


def make_repo(root: Path, name: str) -> Path:
    repo = root / name
    shutil.copytree(OVERLAY_ROOT, repo)
    run(repo, "git", "init", "-q")
    run(repo, "git", "config", "user.email", "self-test@example.com")
    run(repo, "git", "config", "user.name", "Gesture Globe Self Test")
    run(repo, "git", "add", ".")
    run(repo, "git", "commit", "-qm", "baseline")
    return repo


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="gesture-globe-skill-") as temp:
        temp_root = Path(temp)
        repo = make_repo(temp_root, "main")
        assert "VERIFY: PASS" in gg(repo, "verify")
        assert "TASK-001" in gg(repo, "next", "--limit", "3")

        assert "BEGIN: TASK-001" in gg(repo, "begin", "TASK-001")
        assert "RESUME: TASK-001" in gg(repo, "begin", "TASK-001")
        gg(repo, "report", "TASK-001")
        rejection = gg(
            repo,
            "complete",
            "TASK-001",
            "--evidence",
            ".gesture-globe/evidence/TASK-001.md",
            expect=1,
        )
        assert "Evidence validation failed" in rejection
        fill_task_report(repo / ".gesture-globe" / "evidence" / "TASK-001.md")
        assert "SCOPE: PASS" in gg(repo, "check-scope", "TASK-001")
        assert "COMPLETE: TASK-001" in gg(
            repo,
            "complete",
            "TASK-001",
            "--evidence",
            ".gesture-globe/evidence/TASK-001.md",
        )

        # Prove that editing a pre-existing uncommitted file is still detected.
        unrelated = repo / "unrelated.txt"
        unrelated.write_text("before\n", encoding="utf-8")
        gg(repo, "begin", "TASK-002")
        unrelated.write_text("after\n", encoding="utf-8")
        scope = gg(repo, "check-scope", "TASK-002", expect=1)
        assert "unrelated.txt" in scope and "OUT-OF-SCOPE" in scope
        gg(repo, "block", "TASK-002", "--reason", "scope self-test")
        gg(repo, "unblock", "TASK-002")
        unrelated.write_text("before\n", encoding="utf-8")

        for task_id in (
            "TASK-002",
            "TASK-003",
            "TASK-004",
            "TASK-005",
            "TASK-006",
            "TASK-007",
            "TASK-008",
        ):
            gg(repo, "begin", task_id)
            gg(repo, "report", task_id)
            report = repo / ".gesture-globe" / "evidence" / f"{task_id}.md"
            fill_task_report(report)
            assert "SCOPE: PASS" in gg(repo, "check-scope", task_id)
            gg(
                repo,
                "complete",
                task_id,
                "--evidence",
                f".gesture-globe/evidence/{task_id}.md",
            )

        pending_gate = gg(repo, "next", "--limit", "3")
        assert "milestone gate is not recorded" in pending_gate
        locked = gg(repo, "begin", "TASK-101", expect=1)
        assert "locked behind milestone gate MS-0" in locked
        gg(repo, "milestone", "MS-0", "--create-report")
        milestone_report = repo / ".gesture-globe" / "reports" / "MS-0.md"
        fill_milestone_report(milestone_report)
        assert "MILESTONE GATE RECORDED" in gg(
            repo,
            "milestone",
            "MS-0",
            "--record",
            "--report",
            ".gesture-globe/reports/MS-0.md",
        )
        assert "TASK-101" in gg(repo, "next", "--limit", "1")
        assert "VERIFY: PASS" in gg(repo, "verify")

        gg(repo, "begin", "TASK-101")
        protected = repo / "docs" / "Gesture_Globe_实施级需求规格_v3.0.md"
        protected.write_text(
            protected.read_text(encoding="utf-8") + "\nprotected self-test edit\n",
            encoding="utf-8",
        )
        protected_result = gg(repo, "check-scope", "TASK-101", expect=1)
        assert "PROTECTED PATH VIOLATIONS" in protected_result

        # Manual-gate completion must require an explicit confirmation flag.
        manual_repo = make_repo(temp_root, "manual")
        state_path = manual_repo / ".gesture-globe" / "state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        for milestone in ("MS-0", "MS-1"):
            state["milestones"][milestone]["status"] = "passed"
        state["current_milestone"] = "MS-2"
        state["tasks"]["TASK-207"]["status"] = "completed"
        state_path.write_text(
            json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        gg(manual_repo, "begin", "TASK-208")
        gg(manual_repo, "report", "TASK-208")
        manual_report = (
            manual_repo / ".gesture-globe" / "evidence" / "TASK-208.md"
        )
        fill_task_report(manual_report, manual=True)
        no_flag = gg(
            manual_repo,
            "complete",
            "TASK-208",
            "--evidence",
            ".gesture-globe/evidence/TASK-208.md",
            expect=1,
        )
        assert "--manual-evidence-confirmed" in no_flag
        assert "COMPLETE: TASK-208" in gg(
            manual_repo,
            "complete",
            "TASK-208",
            "--evidence",
            ".gesture-globe/evidence/TASK-208.md",
            "--manual-evidence-confirmed",
        )

    print("CONTROLLER SELF-TEST: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
