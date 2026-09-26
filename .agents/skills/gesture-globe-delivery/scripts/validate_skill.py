#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import py_compile
import re
import sys
from pathlib import Path


def discover_repo(skill_root: Path, explicit: Path | None) -> Path | None:
    if explicit is not None:
        return explicit.expanduser().resolve()
    cwd = Path.cwd().resolve()
    if (cwd / ".gesture-globe" / "state.json").exists():
        return cwd
    repo_candidate = skill_root.parents[2]
    if (repo_candidate / ".gesture-globe" / "state.json").exists():
        return repo_candidate
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Gesture Globe Codex skill")
    parser.add_argument("--repo", type=Path, help="project root for ledger/document checks")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    repo = discover_repo(root, args.repo)
    errors: list[str] = []
    warnings: list[str] = []

    skill = root / "SKILL.md"
    text = skill.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append("SKILL.md missing YAML frontmatter")
    else:
        end = text.find("\n---\n", 4)
        if end < 0:
            errors.append("SKILL.md frontmatter not closed")
        else:
            frontmatter = text[4:end]
            for key in ("name:", "description:"):
                if not re.search(rf"(?m)^{re.escape(key)}\s*\S", frontmatter):
                    errors.append(f"frontmatter missing {key[:-1]}")
            if not re.search(
                r"(?m)^name:\s*gesture-globe-delivery\s*$", frontmatter
            ):
                errors.append("unexpected skill name")

    manifest_path = root / "references" / "task-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ids = [task["id"] for task in manifest["tasks"]]
    if len(ids) != 84:
        errors.append(f"expected 84 tasks, got {len(ids)}")
    if len(ids) != len(set(ids)):
        errors.append("duplicate task IDs")
    known = set(ids)
    known_ms = {milestone["id"] for milestone in manifest["milestones"]}
    for task in manifest["tasks"]:
        if task["milestone"] not in known_ms:
            errors.append(f"{task['id']} unknown milestone {task['milestone']}")
        for dependency in task["depends_on"]:
            if dependency not in known:
                errors.append(f"{task['id']} unknown dependency {dependency}")
    manual = {task["id"] for task in manifest["tasks"] if task.get("manual_gate")}
    expected_manual = {
        "TASK-208",
        "TASK-412",
        "TASK-706",
        "TASK-707",
        "TASK-708",
        "TASK-710",
    }
    if manual != expected_manual:
        errors.append(f"manual-gate task set mismatch: {sorted(manual)}")

    required_skill_files = [
        root / "agents" / "openai.yaml",
        root / "scripts" / "gg.py",
        root / "scripts" / "self_test.py",
        root / "references" / "execution-protocol.md",
        root / "references" / "quality-gates.md",
        root / "references" / "module-boundaries.md",
        root / "assets" / "task-report-template.md",
        root / "assets" / "milestone-report-template.md",
    ]
    for path in required_skill_files:
        if not path.exists():
            errors.append(f"missing {path.relative_to(root)}")

    if repo is None:
        warnings.append(
            "project root not discovered; ledger, AGENTS.md, and requirements checks were skipped. "
            "Run again from the project root or pass --repo."
        )
    else:
        state_path = repo / ".gesture-globe" / "state.json"
        if not state_path.exists():
            errors.append(f"missing project ledger: {state_path}")
        else:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            if state.get("schema_version") != "1.1":
                errors.append(
                    f"expected state schema 1.1, got {state.get('schema_version')}"
                )
            if set(state.get("tasks", {})) != known:
                errors.append("project ledger task IDs do not match manifest")
            if set(state.get("milestones", {})) != known_ms:
                errors.append("project ledger milestones do not match manifest")
        for path in (
            repo / "AGENTS.md",
            repo / manifest["requirements_document"],
        ):
            if not path.exists():
                errors.append(f"missing project file: {path}")

    for path in (
        root / "scripts" / "gg.py",
        root / "scripts" / "self_test.py",
    ):
        try:
            py_compile.compile(str(path), doraise=True)
        except py_compile.PyCompileError as exc:
            errors.append(f"{path.name} compile failed: {exc}")

    for warning in warnings:
        print("WARNING:", warning)
    if errors:
        for error in errors:
            print("ERROR:", error)
        return 1
    print("SKILL VALIDATION: PASS")
    print(f"tasks={len(ids)}")
    print(f"milestones={len(known_ms)}")
    print(f"manual_gates={len(manual)}")
    if repo is not None:
        print(f"repo={repo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
