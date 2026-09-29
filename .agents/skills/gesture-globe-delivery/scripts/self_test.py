#!/usr/bin/env python3
"""Reproducible integration self-test for the Gesture Globe controller.

Runs only in temporary Git repositories and never touches product code in the
calling repository.
"""
from __future__ import annotations

import json
import argparse
import hashlib
import locale
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
OVERLAY_ROOT = SKILL_ROOT.parents[2]
sys.dont_write_bytecode = True


def run(repo: Path, *args: str, expect: int = 0) -> str:
    cp = subprocess.run(
        list(args),
        cwd=repo,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONUTF8": "0", "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1", "GIT_OPTIONAL_LOCKS": "0"},
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
    # Copy the existing Git baseline, never commit or touch the caller's index.
    # Exclude our own in-repository scratch tree to avoid recursive copying.
    if not (OVERLAY_ROOT / ".git").is_dir():
        raise RuntimeError("Self-test requires a repository with a local .git directory")
    shutil.copytree(OVERLAY_ROOT, repo, ignore=shutil.ignore_patterns(
        ".gov-self-test-*", "__pycache__", "node_modules", "dist"
    ))
    run(repo, "git", "rev-parse", "HEAD")
    # Tests require a fresh fixture, independent of real host task progress.
    fixture_ledger = (repo / ".gesture-globe").resolve()
    assert fixture_ledger.is_relative_to(root.resolve())
    shutil.rmtree(fixture_ledger)
    gg(repo, "init")
    return repo


def document_counterexamples(repo: Path) -> None:
    validator = controller(repo).with_name("validate_skill.py")
    document = repo / "docs" / "Gesture_Globe_实施级需求规格_v3.0.md"
    original = document.read_text(encoding="utf-8")

    def validate(expect: int = 0) -> str:
        return run(repo, sys.executable, "-B", str(validator), "--repo", str(repo), expect=expect)

    assert "SKILL VALIDATION: PASS" in validate()
    print("DOCUMENT SELF-TEST: normal PASS")
    try:
        before, chapter = original.split("# 24. ", 1)
        assert before.count("TASK-101～110") == 1
        document.write_text(before.replace("TASK-101～110", "TASK-101～112") + "# 24. " + chapter, encoding="utf-8")
        failure = validate(expect=1)
        assert "section 12.1 MS-1" in failure and "TASK-101～112" in failure and "TASK-101～110" in failure
        print("DOCUMENT SELF-TEST: wrong MS-1 summary rejected (exit 1, section 12.1 MS-1)")
    finally:
        document.write_text(original, encoding="utf-8")
    assert "SKILL VALIDATION: PASS" in validate()
    print("DOCUMENT SELF-TEST: summary restoration PASS")
    try:
        lines = original.splitlines(keepends=True)
        removed = [line for line in lines if line.startswith("| TASK-208 |")]
        assert len(removed) == 1
        document.write_text("".join(line for line in lines if line not in removed), encoding="utf-8")
        failure = validate(expect=1)
        assert "chapter 24 MS-2" in failure and "TASK-208" in failure and "missing=" in failure
        print("DOCUMENT SELF-TEST: omitted TASK-208 rejected (exit 1, chapter 24 MS-2)")
    finally:
        document.write_text(original, encoding="utf-8")
    assert "SKILL VALIDATION: PASS" in validate()
    print("DOCUMENT SELF-TEST: task restoration PASS")


def host_snapshot() -> tuple[bytes, bytes, dict[str, str]]:
    import gg as controller_module
    head = controller_module.run_git_bytes(OVERLAY_ROOT, "rev-parse", "HEAD").stdout
    status = controller_module.run_git_bytes(OVERLAY_ROOT, "status", "--porcelain=v1", "-z", "--untracked-files=all").stdout
    tracked = controller_module.run_git_bytes(OVERLAY_ROOT, "ls-files", "-z").stdout
    paths = set(tracked.decode("utf-8", errors="strict").split("\0")) - {""}
    paths.update(controller_module.changed_paths(OVERLAY_ROOT))
    hashes = {p: controller_module.file_fingerprint(OVERLAY_ROOT, p) for p in paths}
    hashes[".git/index"] = hashlib.sha256((OVERLAY_ROOT / ".git/index").read_bytes()).hexdigest()
    return head, status, hashes


def unicode_probe(repo: Path) -> int:
    import gg as c
    assert sys.flags.utf8_mode == 0
    paths = c.changed_paths(repo)
    print(json.dumps(paths, ensure_ascii=False))
    print(json.dumps({"preferred": locale.getpreferredencoding(False), "filesystem": sys.getfilesystemencoding(), "python": sys.version, "git": c.run_git_text(repo, "--version")[1]}, ensure_ascii=False))
    return 0


def unicode_tests(root: Path) -> None:
    import gg as c
    # Standalone Git metadata and worktree; no shared index, alternates, commits,
    # hardlinks, or writes to the caller's repository.
    repo = root / "中文独立仓库"
    repo.mkdir()
    shutil.copytree(OVERLAY_ROOT / ".git", repo / ".git")
    run(repo, "git", "read-tree", "HEAD")
    run(repo, "git", "checkout-index", "-a")
    assert c.changed_paths(repo) == []
    probe = lambda: run(repo, sys.executable, "-B", str(Path(__file__).resolve()), "--unicode-probe", str(repo))
    assert json.loads(probe().splitlines()[0]) == []
    print("UNICODE: clean independent repository PASS")

    allowed = "docs/中文目录/测试文件.md"
    outside = "临时资料/未跟踪文件.txt"
    protected = "受保护目录/中文配置.json"
    for name in (allowed, outside, protected):
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("中文内容\n", encoding="utf-8")
    paths = json.loads(probe().splitlines()[0])
    assert set(paths) == {allowed, outside, protected}
    assert c.path_allowed(allowed, ["docs/**"])
    assert not c.path_allowed(outside, ["docs/**"])
    assert c.path_allowed(protected, ["受保护目录/**"])
    run(repo, "git", "add", "--", allowed)
    assert allowed in json.loads(probe().splitlines()[0])
    (repo / allowed).write_text("修改后的中文内容\n", encoding="utf-8")
    status = c.run_git_bytes(repo, "status", "--porcelain=v1", "-z").stdout
    assert b"AM " + allowed.encode("utf-8") + b"\0" in status
    assert allowed in json.loads(probe().splitlines()[0])
    (repo / allowed).unlink()
    assert allowed in json.loads(probe().splitlines()[0])
    original = "docs/Gesture_Globe_实施级需求规格_v3.0.md"
    renamed = "docs/中文目录/重命名 保留空格.md"
    run(repo, "git", "mv", "--", original, renamed)
    paths = json.loads(probe().splitlines()[0])
    assert original in paths and renamed in paths
    print("UNICODE: untracked/staged/modified/deleted/renamed exact paths PASS")
    print(probe().splitlines()[1])

    # Old bug counterexample without brittle rewriting of controller source.
    old = "import subprocess; subprocess.run(['git','-c','core.quotepath=false','status','--porcelain=v1'],text=True,encoding='cp936',stdout=subprocess.PIPE,check=True)"
    rejected = run(repo, sys.executable, "-B", "-c", old, expect=1)
    assert "UnicodeDecodeError" in rejected
    print("UNICODE: old CP936 text decoder counterexample rejected (exit 1)")

    result = c.GitResult(("git", "status", "-z"), repo, 0, b"?? invalid-\xff\0", b"", False)
    try:
        c.parse_status_paths(result)
    except SystemExit as exc:
        assert "UTF-8 decode failed" in str(exc) and "exit=0" in str(exc)
    else:
        raise AssertionError("Invalid path encoding was silently accepted")
    synthetic = c.GitResult(("git", "status", "-z"), repo, 0, '?? docs/空格 -> \"引号\"\t换\n行.md\0'.encode(), b"", False)
    assert c.parse_status_paths(synthetic) == ['docs/空格 -> "引号"\t换\n行.md']
    failed = c.run_git_bytes(repo, "not-a-git-command", allow_nonzero=True)
    assert failed.returncode != 0 and failed.stderr and failed.allow_nonzero
    assert failed.cwd == repo and failed.command[0] == "git"
    try:
        c.run_git_bytes(repo, "not-a-git-command")
    except SystemExit as exc:
        assert "not-a-git-command" in str(exc) and "exit=" in str(exc)
    else:
        raise AssertionError("Git failure was silently accepted")
    print("UNICODE: malformed UTF-8 fails closed; unusual paths and command errors PASS")

    scope_repo = make_repo(root, "中文范围检查")
    gg(scope_repo, "begin", "TASK-001")
    (scope_repo / allowed).parent.mkdir(parents=True, exist_ok=True)
    (scope_repo / allowed).write_text("允许\n", encoding="utf-8")
    output = gg(scope_repo, "check-scope", "TASK-001")
    assert allowed in output and "SCOPE: PASS" in output
    (scope_repo / outside).parent.mkdir(parents=True)
    (scope_repo / outside).write_text("越界\n", encoding="utf-8")
    output = gg(scope_repo, "check-scope", "TASK-001", expect=1)
    assert outside in output and "OUT-OF-SCOPE" in output
    with (scope_repo / original).open("a", encoding="utf-8") as file:
        file.write("\n保护路径测试\n")
    output = gg(scope_repo, "check-scope", "TASK-001", expect=1)
    assert original in output and "PROTECTED PATH VIOLATIONS" in output
    # Exercise the exact command handler with an in-memory protected pattern,
    # without changing any manifest file, including the temporary manifest.
    manifest, mh = c.load_manifest()
    manifest["protected_paths"].append("受保护目录/**")
    (scope_repo / protected).parent.mkdir(parents=True)
    (scope_repo / protected).write_text("{}\n", encoding="utf-8")
    from unittest.mock import patch
    import contextlib
    import io
    buffer = io.StringIO()
    with patch.object(c, "load_manifest", return_value=(manifest, mh)), contextlib.redirect_stdout(buffer):
        assert c.cmd_check_scope(argparse.Namespace(repo=str(scope_repo), task="TASK-001")) == 1
    assert protected in buffer.getvalue().split("PROTECTED PATH VIOLATIONS:")[1]
    print("UNICODE: allowed/outside/protected scope and original Chinese diagnostics PASS")
    assert c.changed_paths(OVERLAY_ROOT)
    print("UNICODE PATH REGRESSION: PASS")


def controller_tests(temp_root: Path) -> None:
    repo = make_repo(temp_root, "main")
    document_counterexamples(repo)
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



def development_policy_tests(temp_root: Path) -> None:
    import gg as c
    repo = make_repo(temp_root, "joint-acceptance")
    manifest = json.loads((repo / ".agents/skills/gesture-globe-delivery/references/task-manifest.json").read_text(encoding="utf-8"))
    policy = manifest["development_policy"]
    state_file = repo / ".gesture-globe/state.json"
    reports = repo / ".gesture-globe/reports"
    reports.mkdir(exist_ok=True)
    before = dict(manifest)
    before.pop("development_policy")
    before_text = json.dumps(before, ensure_ascii=False, indent=2) + "\n"
    (reports / "before.json").write_text(before_text, encoding="utf-8")
    (reports / "authorization.json").write_text(json.dumps({"policy": policy, "user_authorization": "Synthetic governance fixture only"}), encoding="utf-8")

    def read():
        return json.loads(state_file.read_text(encoding="utf-8"))
    def fixture_write(state):
        # Fixture-only state injection; never writes the host ledger.
        assert state_file.resolve().is_relative_to(temp_root.resolve())
        state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    def seed_completed(state, ids):
        for tid in ids:
            evidence = repo / f".gesture-globe/evidence/{tid}.md"
            evidence.write_text(f"# {tid}\n**Status:** PASS\n**Manual gate evidence:** NOT_REQUIRED\n## Commands and results\n| fixture | PASS | synthetic controller fixture |\n## Completion decision\nController-only fixture.\n", encoding="utf-8")
            state["tasks"][tid].update(status="completed", evidence=str(evidence.relative_to(repo)).replace("\\", "/"))
    state = read()
    state["manifest_sha256"] = c.sha256_text(before_text)
    for ms in manifest["milestones"][:2]:
        seed_completed(state, ms["task_ids"])
        report = reports / f"{ms['id']}.md"
        report.write_text(f"# {ms['id']}\n**Status:** PASS\n## Decision\nSynthetic fixture.\n", encoding="utf-8")
        state["milestones"][ms["id"]].update(status="passed", report=str(report.relative_to(repo)).replace("\\", "/"))
    seed_completed(state, [f"TASK-{n}" for n in range(201, 208)])
    state["tasks"]["TASK-208"].update(status="blocked", note="Original manual evidence missing")
    state["current_milestone"] = "MS-2"
    fixture_write(state)
    args = ("adopt-development-policy", "--before", ".gesture-globe/reports/before.json", "--report", ".gesture-globe/reports/authorization.json")
    assert "manifest hash mismatch" in gg(repo, "begin", "TASK-301", expect=1)
    assert "POLICY ADOPTED" in gg(repo, *args)
    assert read()["tasks"] == state["tasks"]
    assert read()["milestones"] == state["milestones"]
    assert "exact ledger baseline" in gg(repo, *args, expect=1)
    # Exercise a real policy-only upgrade; historical evidence must remain pinned.
    manifest_path = repo / ".agents/skills/gesture-globe-delivery/references/task-manifest.json"
    upgrade_before = reports / "upgrade-before.json"
    upgrade_before.write_bytes(manifest_path.read_bytes())
    manifest["development_policy"]["id"] += "/fixture-upgrade"
    policy = manifest["development_policy"]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    auth = reports / "upgrade-authorization.json"
    auth.write_text(json.dumps({"policy": policy, "user_authorization": "Synthetic upgrade fixture"}), encoding="utf-8")
    gg(repo, "adopt-development-policy", "--before", str(upgrade_before.relative_to(repo)), "--report", str(auth.relative_to(repo)))
    assert len(read()["development_policy_history"]) == 1
    assert read()["tasks"] == state["tasks"] and read()["milestones"] == state["milestones"]
    assert "locked" in gg(repo, "begin", "TASK-301", expect=1)
    assert "not authorized" in gg(repo, "defer-manual", "TASK-301", "--report", "missing", expect=1)
    assert not c.development_dependency(manifest, read(), "TASK-208", "TASK-301")
    altered = json.loads(json.dumps(manifest))
    altered["development_policy"]["deferred_tasks"]["TASK-208"] = []
    assert c.development_policy(altered, read()) == {}, "policy mutation must invalidate adoption"

    quality = {"localQuality": "PASS", "results": [{"name": name, "status": "PASS", "exitCode": 0} for name in ("lint", "format:check", "typecheck", "test:unit", "test:contract", "test:integration", "test:coverage", "build", "test:e2e")]}
    qpath = reports / "quality.json"
    qpath.write_text(json.dumps(quality), encoding="utf-8")
    def defer(tid):
        data = {"task": tid, "automation": "PASS", "manual": "PARTIAL", "quality_report": ".gesture-globe/reports/quality.json", "quality_sha256": c.sha256_file(qpath)}
        path = reports / f"{tid}-defer.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        gg(repo, "defer-manual", tid, "--report", str(path.relative_to(repo)))
    def engineering(ms, expect=0):
        path = reports / f"{ms}-engineering.md"
        path.write_text(f"# {ms}\n**Status:** ENGINEERING_PASS\n**Manual acceptance:** PENDING\n## Commands and results\n| fixture | PASS | controller only |\n", encoding="utf-8")
        return gg(repo, "engineering-gate", ms, "--report", str(path.relative_to(repo)), expect=expect)
    assert "Incomplete" in engineering("MS-2", expect=1)
    defer("TASK-208")
    assert read()["tasks"]["TASK-208"]["status"] == "blocked"
    engineering("MS-2")
    assert read()["milestones"]["MS-2"]["status"] == "pending"
    assert "TASK-301" in gg(repo, "next")
    assert "NOT READY" in gg(repo, "milestone", "MS-2", "--record", expect=1)
    gg(repo, "begin", "TASK-301")
    assert "Another task" in gg(repo, "begin", "TASK-302", expect=1)
    gg(repo, "block", "TASK-301", "--reason", "fixture")
    assert "Incomplete" in engineering("MS-3", expect=1)
    state = read()
    seed_completed(state, [f"TASK-{n}" for n in range(301, 311)])
    fixture_write(state)
    engineering("MS-3")
    state = read()
    seed_completed(state, [f"TASK-{n}" for n in range(401, 412)])
    state["tasks"]["TASK-412"].update(status="blocked", note="Human tuning pending")
    fixture_write(state)
    defer("TASK-412")
    engineering("MS-4")
    assert "Dependencies incomplete" in gg(repo, "begin", "TASK-508", expect=1)
    state = read()
    seed_completed(state, [f"TASK-{n}" for n in range(501, 508)])
    fixture_write(state)
    gg(repo, "begin", "TASK-508")
    gg(repo, "report", "TASK-508")
    fill_task_report(repo / ".gesture-globe/evidence/TASK-508.md")
    gg(repo, "complete", "TASK-508", "--evidence", ".gesture-globe/evidence/TASK-508.md")
    assert read()["tasks"]["TASK-508"]["pending_manual_dependencies"] == ["TASK-412"]
    assert "JOINT MANUAL ACCEPTANCE REQUIRED" not in gg(repo, "next")
    assert "locked" in gg(repo, "begin", "TASK-601", expect=1)
    engineering("MS-5")
    assert "TASK-601" in gg(repo, "next")
    state = read()
    seed_completed(state, [f"TASK-{n}" for n in range(601, 613)])
    fixture_write(state)
    engineering("MS-6")
    state = read()
    seed_completed(state, [f"TASK-{n}" for n in range(701, 706)])
    for tid in ("TASK-706", "TASK-707", "TASK-708", "TASK-710"):
        state["tasks"][tid].update(status="blocked", note="Final real evidence pending")
    fixture_write(state)
    for tid in ("TASK-706", "TASK-707", "TASK-708"):
        defer(tid)
    state = read()
    seed_completed(state, ["TASK-709"])
    fixture_write(state)
    defer("TASK-710")
    engineering("MS-7")
    assert "TASK-801" in gg(repo, "next")
    state = read()
    seed_completed(state, [f"TASK-{n}" for n in range(801, 807)])
    fixture_write(state)
    assert "JOINT MANUAL ACCEPTANCE REQUIRED" in gg(repo, "next")
    engineering("MS-8")
    assert "JOINT MANUAL ACCEPTANCE REQUIRED" in gg(repo, "next")
    assert "VERIFY: PASS" in gg(repo, "verify")
    saved = qpath.read_bytes()
    qpath.write_text("{}", encoding="utf-8")
    assert "automation evidence changed" in gg(repo, "verify", expect=1)
    qpath.write_bytes(saved)
    gg(repo, "unblock", "TASK-208")
    gg(repo, "begin", "TASK-208")
    assert "VERIFY: PASS" in gg(repo, "verify")
    # No manual evidence: even with development permission it cannot complete.
    gg(repo, "report", "TASK-208")
    assert "Evidence validation failed" in gg(repo, "complete", "TASK-208", "--evidence", ".gesture-globe/evidence/TASK-208.md", expect=1)
    print("JOINT ACCEPTANCE POLICY: PASS; pending manual/overall gates retained; no unauthorized dependencies; evidence tampering rejected")


def progress_model_tests(temp_root: Path) -> None:
    import gg as c
    repo = make_repo(temp_root, "dual-status")
    state_file = repo / ".gesture-globe/state.json"
    reports = repo / ".gesture-globe/reports"
    reports.mkdir(exist_ok=True)
    read = lambda: json.loads(state_file.read_text(encoding="utf-8"))
    before = read()
    auth = reports / "progress-auth.json"
    auth.write_text(json.dumps({"model": "ENGINEERING_ACCEPTANCE_V1", "user_authorization": "Synthetic dual-status fixture"}), encoding="utf-8")
    gg(repo, "progress-model", "--report", str(auth.relative_to(repo)))
    assert {tid: rec["status"] for tid, rec in read()["tasks"].items()} == {tid: rec["status"] for tid, rec in before["tasks"].items()}
    assert read()["milestones"] == before["milestones"]
    gg(repo, "begin", "TASK-001")
    gg(repo, "report", "TASK-001")
    evidence = repo / ".gesture-globe/evidence/TASK-001.md"
    fill_task_report(evidence)
    evidence.write_text(evidence.read_text(encoding="utf-8") + "\n**Acceptance status:** ACCEPTANCE_DEFERRED\n## Deferred acceptance\nSynthetic real-device check pending; engineering only.\n", encoding="utf-8")
    gg(repo, "complete", "TASK-001", "--evidence", str(evidence.relative_to(repo)))
    rec = read()["tasks"]["TASK-001"]
    assert rec["engineeringStatus"] == "ENGINEERING_COMPLETE" and rec["acceptanceStatus"] == "ACCEPTANCE_DEFERRED"
    assert "TASK-002" in gg(repo, "next")
    state = read()
    for tid in [f"TASK-{n:03}" for n in range(2, 9)]:
        path = repo / f".gesture-globe/evidence/{tid}.md"
        path.write_text(f"# {tid}\n**Status:** PASS\n**Manual gate evidence:** NOT_REQUIRED\n## Commands and results\n| fixture | PASS | synthetic |\n## Completion decision\nSynthetic engineering.\n", encoding="utf-8")
        state["tasks"][tid].update(status="completed", evidence=str(path.relative_to(repo)).replace("\\", "/"))
    c.refresh_progress(state)
    assert state_file.resolve().is_relative_to(temp_root.resolve())
    state_file.write_text(json.dumps(state), encoding="utf-8")
    assert "NOT READY" in gg(repo, "milestone", "MS-0", "--record", expect=1)
    acceptance = reports / "TASK-001-actual-acceptance.md"
    acceptance.write_text(evidence.read_text(encoding="utf-8").replace("**Manual gate evidence:** NOT_REQUIRED", "**Manual gate evidence:** PASS").replace("**Acceptance status:** ACCEPTANCE_DEFERRED", "**Acceptance status:** ACCEPTANCE_PASSED"), encoding="utf-8")
    args = ("acceptance", "TASK-001", "--report", str(acceptance.relative_to(repo)))
    assert "manual-evidence-confirmed" in gg(repo, *args, expect=1)
    gg(repo, *args, "--manual-evidence-confirmed")
    rec = read()["tasks"]["TASK-001"]
    assert rec["acceptanceStatus"] == "ACCEPTANCE_PASSED" and rec["acceptance_deferred"]
    assert "VERIFY: PASS" in gg(repo, "verify")
    saved = acceptance.read_bytes()
    acceptance.write_text("tampered", encoding="utf-8")
    assert "evidence changed" in gg(repo, "verify", expect=1)
    acceptance.write_bytes(saved)
    assert "VERIFY: PASS" in gg(repo, "verify")
    print("DUAL STATUS: PASS; code progression retained, actual acceptance cannot be inferred, full gate refuses debt, evidence pinned")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--unicode-only", action="store_true")
    parser.add_argument("--unicode-probe", type=Path)
    args = parser.parse_args()
    if args.unicode_probe:
        return unicode_probe(args.unicode_probe)
    os.environ["GIT_OPTIONAL_LOCKS"] = "0"
    before = host_snapshot()
    with tempfile.TemporaryDirectory(prefix=".gov-self-test-", dir=OVERLAY_ROOT / ".gesture-globe") as temp:
        temp_root = Path(temp)
        assert temp_root.resolve().is_relative_to(OVERLAY_ROOT.resolve())
        unicode_tests(temp_root)
        if not args.unicode_only:
            controller_tests(temp_root)
            development_policy_tests(temp_root)
            progress_model_tests(temp_root)
    assert not temp_root.exists()
    assert host_snapshot() == before, "Self-test changed caller HEAD, index, status, or file content"
    print("HOST PRESERVATION: PASS; HEAD/index/staged/unstaged/untracked/content unchanged; scratch removed")
    if not args.unicode_only:
        print("CONTROLLER SELF-TEST: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
