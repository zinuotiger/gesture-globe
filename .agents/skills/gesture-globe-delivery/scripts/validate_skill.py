#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path


def validate_git_structure(source: str) -> list[str]:
    """Known-regression guard, not a proof of arbitrary Python data flow."""
    errors: list[str] = []
    tree = ast.parse(source)
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    functions = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
    for required in ("run_git_bytes", "run_git_text", "decode_git_paths", "parse_status_paths"):
        if required not in functions:
            errors.append(f"gg.py missing Git helper {required}")
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name) and target.value.id == "subprocess":
            owner = node
            while owner in parents and not isinstance(owner, ast.FunctionDef):
                owner = parents[owner]
            if not isinstance(owner, ast.FunctionDef) or owner.name != "run_git_bytes" or target.attr != "run":
                errors.append(f"gg.py:{node.lineno}: subprocess call bypasses run_git_bytes")
            kw = {arg.arg: arg.value for arg in node.keywords}
            if not isinstance(kw.get("text"), ast.Constant) or kw["text"].value is not False:
                errors.append(f"gg.py:{node.lineno}: Git subprocess must specify text=False")
            if any(name in kw for name in ("encoding", "errors", "universal_newlines")):
                errors.append(f"gg.py:{node.lineno}: Git subprocess must capture raw bytes without text decoding options")
        for keyword in node.keywords:
            if keyword.arg == "errors" and isinstance(keyword.value, ast.Constant) and keyword.value.value in ("ignore", "replace"):
                errors.append(f"gg.py:{node.lineno}: lossy decoding forbidden")
        if isinstance(target, ast.Name) and target.id == "run_git_bytes":
            literals = [arg.value for arg in node.args if isinstance(arg, ast.Constant)]
            if "status" in literals and "-z" not in literals:
                errors.append(f"gg.py:{node.lineno}: status paths must use -z")
    return errors


def section(document: str, number: str) -> str:
    match = re.search(rf"(?m)^## {re.escape(number)} .*\n", document)
    if match is None:
        return ""
    return re.split(r"(?m)^#{1,2} ", document[match.end():], maxsplit=1)[0]


def expand_dependencies(expression: str, task_id: str, known: set[str]) -> set[str]:
    if expression == "无":
        return set()
    if expression == "全部":
        return {item for item in known if item < task_id}
    result: set[str] = set()
    for part in expression.split(","):
        if re.fullmatch(r"\d{3}-\d{3}", part):
            start, end = map(int, part.split("-"))
            result.update(f"TASK-{n:03}" for n in range(start, end + 1)
                          if f"TASK-{n:03}" in known)
        elif re.fullmatch(r"\d{3}", part):
            result.add(f"TASK-{part}")
        else:
            raise ValueError(f"unsupported dependency expression {expression!r}")
    return result


def validate_document(manifest: dict, document: str) -> list[str]:
    errors: list[str] = []
    policy = manifest.get("development_policy")
    if policy:
        mirror = re.search(r"<!-- DEVELOPMENT_POLICY_BEGIN -->\s*```json\s*(.*?)\s*```\s*<!-- DEVELOPMENT_POLICY_END -->", document, re.S)
        try:
            actual_policy = json.loads(mirror[1]) if mirror else None
        except json.JSONDecodeError:
            actual_policy = None
        if actual_policy != policy:
            errors.append(f"section 24.15 development policy: document={actual_policy}; manifest={policy}")
    tasks = {task["id"]: task for task in manifest["tasks"]}
    known = set(tasks)
    summary = section(document, "12.1")
    summary_rows: dict[str, list[str]] = {}
    for line in summary.splitlines():
        match = re.match(r"\| (MS-\d+) \|.*?\| (TASK-\d{3}～\d{3}) \|", line)
        if match:
            summary_rows.setdefault(match[1], []).append(match[2])
    chapter = re.search(r"(?ms)^# 24\. .*?(?=^# 25\. |\Z)", document)
    rows: dict[str, list[tuple[str, list[str]]]] = {}
    current = "UNKNOWN"
    if chapter:
        for line in chapter[0].splitlines():
            heading = re.match(r"## 24\.\d+ (MS-\d+)", line)
            if heading:
                current = heading[1]
            if re.match(r"\| TASK-\d+ \|", line):
                cells = [cell.strip() for cell in line.split("|")[1:-1]]
                rows.setdefault(current, []).append((cells[0], cells))
    for milestone in manifest["milestones"]:
        ms = milestone["id"]
        expected = milestone["task_ids"]
        expected_range = f"{expected[0]}～{expected[-1].removeprefix('TASK-')}"
        actual_ranges = summary_rows.get(ms, [])
        if actual_ranges != [expected_range]:
            errors.append(f"section 12.1 {ms}: document={actual_ranges}; manifest={expected_range} ({len(expected)} tasks)")
        actual = [tid for tid, _ in rows.get(ms, [])]
        if actual != expected:
            errors.append(f"chapter 24 {ms}: document={actual}; manifest={expected}; missing={sorted(set(expected)-set(actual))}; extra={sorted(set(actual)-set(expected))}")
    known_ms = {ms["id"] for ms in manifest["milestones"]}
    for ms in (set(rows) | set(summary_rows)) - known_ms:
        errors.append(f"sections 12.1/24: document milestone={ms}; manifest has no such milestone")
    for ms, entries in rows.items():
        for tid, cells in entries:
            if tid not in tasks:
                errors.append(f"chapter 24 {ms}: document task={tid}; manifest=MISSING")
                continue
            task = tasks[tid]
            if len(cells) != 4:
                errors.append(f"chapter 24 {ms} {tid}: document cells={cells}; expected ID/title/dependency/standard")
                continue
            for field, actual in zip(("title", "dependency_expression", "completion_standard"), cells[1:]):
                if actual != task[field]:
                    errors.append(f"chapter 24 {ms} {tid} {field}: document={actual!r}; manifest={task[field]!r}")
            try:
                dependencies = expand_dependencies(cells[2], tid, known)
                if dependencies != set(task["depends_on"]):
                    errors.append(f"chapter 24 {ms} {tid}: document dependencies={sorted(dependencies)}; manifest={task['depends_on']}")
            except ValueError as exc:
                errors.append(f"chapter 24 {ms} {tid}: {exc}; manifest={task['depends_on']}")
    p0_count = sum(t["milestone"] != "MS-8" for t in tasks.values())
    release = section(document, "25.2")
    expected_release = f"task-manifest.json 中 MS-0～MS-7 的全部 {p0_count} 个任务完成；MS-8/P2 不阻塞 P0。"
    if expected_release not in release or re.search(r"TASK-\d+\s*[～~–—-]\s*(?:TASK-)?\d+", release):
        errors.append(f"section 25.2 release task checklist: document={release.strip()!r}; manifest-derived expected={expected_release!r}; continuous TASK ranges are forbidden")
    return errors


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
    errors.extend(validate_git_structure((root / "scripts" / "gg.py").read_text(encoding="utf-8")))
    warnings.append("Git AST guard: PARTIAL static assurance; dynamic aliases/data flow are not proven. Unicode behavior self-tests remain required.")

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
    if manifest.get("task_count") != len(ids):
        errors.append(f"manifest task_count={manifest.get('task_count')}; actual tasks={len(ids)}")
    if len(ids) != 84:
        errors.append(f"expected 84 tasks, got {len(ids)}")
    if len(ids) != len(set(ids)):
        errors.append("duplicate task IDs")
    known = set(ids)
    known_ms = {milestone["id"] for milestone in manifest["milestones"]}
    if len(known_ms) != len(manifest["milestones"]):
        errors.append("manifest has duplicate milestone IDs")
    for milestone in manifest["milestones"]:
        ms = milestone["id"]
        expected = [task["id"] for task in manifest["tasks"] if task["milestone"] == ms]
        if milestone["task_ids"] != expected:
            errors.append(f"manifest {ms}: milestone.task_ids={milestone['task_ids']}; tasks.milestone={expected}")
        expected_manual_ms = [task["id"] for task in manifest["tasks"]
                              if task["milestone"] == ms and task.get("manual_gate")]
        if milestone["manual_gate_task_ids"] != expected_manual_ms:
            errors.append(f"manifest {ms}: manual_gate_task_ids={milestone['manual_gate_task_ids']}; task flags={expected_manual_ms}")
    p0_count = sum(task["milestone"] in {f"MS-{n}" for n in range(8)} for task in manifest["tasks"])
    p2_count = sum(task["milestone"] == "MS-8" for task in manifest["tasks"])
    if (p0_count, p2_count) != (78, 6):
        errors.append(f"authorized scope totals: MS-0..MS-7={p0_count}, MS-8={p2_count}; required=78,6")
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
        errors.append(f"manifest manual-gate task set={sorted(manual)}; authorized set={sorted(expected_manual)}")

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
        requirements = repo / manifest["requirements_document"]
        if requirements.exists():
            errors.extend(validate_document(manifest, requirements.read_text(encoding="utf-8")))

    for path in (
        root / "scripts" / "gg.py",
        root / "scripts" / "self_test.py",
    ):
        try:
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        except SyntaxError as exc:
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
