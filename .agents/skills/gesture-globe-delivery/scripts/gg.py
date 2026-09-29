#!/usr/bin/env python3
"""Gesture Globe task-ledger controller.

Standard-library only. It manages resumable task selection, milestone gates,
evidence validation, dependency checks, and git-backed scope checks. It does not
modify product code and does not run package-manager commands.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import locale
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCRIPT = Path(__file__).resolve()
SKILL_ROOT = SCRIPT.parent.parent
MANIFEST_PATH = SKILL_ROOT / "references" / "task-manifest.json"
STATE_SCHEMA_VERSION = "1.1"
TASK_STATUSES = {"pending", "in_progress", "blocked", "completed"}
MILESTONE_STATUSES = {"pending", "passed"}
TASK_EVIDENCE_PLACEHOLDERS = (
    "<ISO timestamp>",
    "<IDs/sections>",
    "<command>",
    "<summary or file>",
    "<check>",
    "<browser/device/path>",
)
MILESTONE_PLACEHOLDERS = (
    "<name>",
    "<ISO date>",
    "<sha256>",
    "TASK-XXX",
    "completed/blocked/pending",
)


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def find_repo(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (
            (candidate / ".git").exists()
            or (candidate / "package.json").exists()
            or (candidate / "AGENTS.md").exists()
        ):
            return candidate
    return current


def load_manifest() -> tuple[dict[str, Any], str]:
    raw = MANIFEST_PATH.read_text(encoding="utf-8")
    return json.loads(raw), sha256_text(raw)


def state_path(repo: Path) -> Path:
    return repo / ".gesture-globe" / "state.json"


def load_state(repo: Path) -> dict[str, Any]:
    path = state_path(repo)
    if not path.exists():
        raise SystemExit("Ledger missing. Run: gg.py init")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Ledger is unreadable: {exc}") from exc


def acceptance_owed(state: dict[str, Any], tid: str) -> bool:
    rec = state["tasks"][tid]
    return bool(rec.get("acceptance_deferred") and not rec.get("acceptance_resolution"))


def refresh_progress(state: dict[str, Any]) -> None:
    if not state.get("progress_model"):
        return
    for tid, rec in state["tasks"].items():
        prepared = tid in state.get("development_deferrals", {})
        complete = rec["status"] == "completed"
        rec["engineeringStatus"] = ("ENGINEERING_COMPLETE" if complete or prepared else
                                    {"pending": "NOT_STARTED", "in_progress": "IN_PROGRESS", "blocked": "BLOCKED"}[rec["status"]])
        rec["acceptanceStatus"] = ("ACCEPTANCE_DEFERRED" if acceptance_owed(state, tid) or (prepared and not complete) else
                                   "ACCEPTANCE_PASSED" if rec.get("acceptance_resolution") or rec.get("manual_evidence_confirmed") else
                                   "AUTOMATED_CHECKS_PASSED" if complete else "NOT_RUN")


def save_state(repo: Path, state: dict[str, Any]) -> None:
    path = state_path(repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = utc_now()
    refresh_progress(state)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def task_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {t["id"]: t for t in manifest["tasks"]}


def milestone_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {m["id"]: m for m in manifest["milestones"]}


def normalize_task_id(value: str) -> str:
    v = value.strip().upper()
    if v.isdigit():
        return f"TASK-{int(v):03d}"
    if v.startswith("TASK-") and v[5:].isdigit():
        return f"TASK-{int(v[5:]):03d}"
    return v


def normalize_milestone_id(value: str) -> str:
    value = value.strip().upper()
    if value.isdigit():
        return f"MS-{int(value)}"
    return value


def ensure_state_shape(state: dict[str, Any], manifest: dict[str, Any]) -> bool:
    """Migrate older ledgers without discarding task progress."""
    changed = False
    if state.get("schema_version") != STATE_SCHEMA_VERSION:
        state["schema_version"] = STATE_SCHEMA_VERSION
        changed = True
    if "milestones" not in state or not isinstance(state["milestones"], dict):
        state["milestones"] = {}
        changed = True
    for ms in manifest["milestones"]:
        if ms["id"] not in state["milestones"]:
            state["milestones"][ms["id"]] = {
                "status": "pending",
                "report": None,
                "passed_at": None,
            }
            changed = True
    for task in manifest["tasks"]:
        rec = state.setdefault("tasks", {}).setdefault(
            task["id"],
            {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "evidence": None,
                "note": None,
                "baseline_head": None,
                "baseline_changed_paths": [],
                "baseline_path_hashes": {},
            },
        )
        if "baseline_path_hashes" not in rec:
            rec["baseline_path_hashes"] = {}
            changed = True
    if "active_task" not in state:
        state["active_task"] = None
        changed = True
    return changed


def load_ready_state(repo: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    state = load_state(repo)
    if state.get("manifest_sha256") != sha256_text(MANIFEST_PATH.read_text(encoding="utf-8")):
        raise SystemExit("ledger manifest hash mismatch; formal governance adoption required")
    if ensure_state_shape(state, manifest):
        save_state(repo, state)
    errors = validate_development_records(repo, manifest, state)
    if errors:
        raise SystemExit("Development policy records invalid: " + "; ".join(errors))
    return state


def open_milestone(manifest: dict[str, Any], state: dict[str, Any]) -> dict[str, Any] | None:
    for ms in manifest["milestones"]:
        if not development_gate_passed(manifest, state, ms["id"]):
            return ms
    return None


def development_policy(manifest: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    policy = manifest.get("development_policy", {})
    adoption = state.get("development_policy_adoption", {})
    digest = sha256_text(json.dumps(policy, ensure_ascii=False, sort_keys=True))
    return policy if policy and adoption.get("id") == policy.get("id") and adoption.get("policy_sha256") == digest else {}


def deferred_for_joint(manifest: dict[str, Any], state: dict[str, Any], tid: str) -> bool:
    policy = development_policy(manifest, state)
    return (tid in policy.get("deferred_tasks", {})
            and tid in state.get("development_deferrals", {})
            and state["tasks"][tid]["status"] != "completed")


def development_gate_passed(manifest: dict[str, Any], state: dict[str, Any], ms: str) -> bool:
    rec = state["milestones"].get(ms, {})
    if rec.get("status") == "passed":
        return True
    policy = development_policy(manifest, state)
    return (ms in policy.get("engineering_milestones", [])
            and rec.get("engineering", {}).get("status") == "passed")


def development_dependency(manifest: dict[str, Any], state: dict[str, Any], dep: str, tid: str) -> bool:
    if state["tasks"].get(dep, {}).get("status") == "completed":
        return True
    policy = development_policy(manifest, state)
    return (deferred_for_joint(manifest, state, dep)
            and tid in policy.get("deferred_tasks", {}).get(dep, []))


def prior_development_gates(manifest: dict[str, Any], state: dict[str, Any], target: str) -> bool:
    for ms in manifest["milestones"]:
        if ms["id"] == target:
            return True
        if not development_gate_passed(manifest, state, ms["id"]):
            return False
    return False


def prior_milestones_passed(
    manifest: dict[str, Any], state: dict[str, Any], milestone_id: str
) -> bool:
    for ms in manifest["milestones"]:
        if ms["id"] == milestone_id:
            return True
        if state["milestones"].get(ms["id"], {}).get("status") != "passed":
            return False
    return False


@dataclass(frozen=True)
class GitResult:
    command: tuple[str, ...]
    cwd: Path
    returncode: int
    stdout: bytes
    stderr: bytes
    allow_nonzero: bool

    def diagnostic(self) -> str:
        # Display only; never use this fallback for paths or security decisions.
        try:
            detail = self.stderr.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            try:
                detail = self.stderr.decode(locale.getpreferredencoding(False), errors="strict")
            except UnicodeDecodeError:
                detail = repr(self.stderr)
        return f"command={self.command!r}; cwd={str(self.cwd)!r}; exit={self.returncode}; stderr={detail!r}"


def run_git_bytes(repo: Path, *args: str, allow_nonzero: bool = False) -> GitResult:
    command = ("git", "-c", "core.quotepath=false", *args)
    try:
        cp = subprocess.run(
            command,
            cwd=repo,
            text=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        result = GitResult(command, repo, cp.returncode, cp.stdout, cp.stderr, allow_nonzero)
    except OSError as exc:
        result = GitResult(command, repo, 127, b"", str(exc).encode("utf-8"), allow_nonzero)
    if result.returncode and not allow_nonzero:
        raise SystemExit("Git command failed: " + result.diagnostic())
    return result


def decode_git_paths(data: bytes, result: GitResult) -> str:
    try:
        return data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise SystemExit(
            "Git UTF-8 decode failed; scope cannot be determined safely: "
            + result.diagnostic() + f"; byte offset={exc.start}"
        ) from exc


def run_git_text(repo: Path, *args: str, allow_nonzero: bool = False) -> tuple[int, str]:
    result = run_git_bytes(repo, *args, allow_nonzero=allow_nonzero)
    if result.returncode:
        return result.returncode, result.diagnostic()
    return result.returncode, decode_git_paths(result.stdout, result).rstrip()


def parse_status_paths(result: GitResult) -> list[str]:
    if result.returncode:
        raise SystemExit("Git status failed: " + result.diagnostic())
    if result.stdout and not result.stdout.endswith(b"\0"):
        raise SystemExit("Git status missing NUL terminator: " + result.diagnostic())
    fields = result.stdout.split(b"\0")[:-1]
    paths: set[str] = set()
    index = 0
    while index < len(fields):
        field = fields[index]
        index += 1
        if len(field) < 4 or field[2:3] != b" ":
            raise SystemExit("Malformed Git status record: " + result.diagnostic())
        paths.add(decode_git_paths(field[3:], result))
        if b"R" in field[:2] or b"C" in field[:2]:
            # porcelain v1 -z emits destination then a separate source path.
            if index >= len(fields) or not fields[index]:
                raise SystemExit("Missing Git rename source: " + result.diagnostic())
            paths.add(decode_git_paths(fields[index], result))
            index += 1
    return sorted(paths)


def changed_paths(repo: Path) -> list[str]:
    result = run_git_bytes(
        repo,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
    )
    return parse_status_paths(result)


def git_head(repo: Path) -> str | None:
    code, out = run_git_text(repo, "rev-parse", "HEAD", allow_nonzero=True)
    return out if code == 0 else None


def file_fingerprint(repo: Path, relative: str) -> str:
    path = repo / relative
    if not path.exists():
        return "<missing>"
    if path.is_dir():
        return "<directory>"
    try:
        return sha256_file(path)
    except OSError as exc:
        return f"<unreadable:{type(exc).__name__}>"


def snapshot_paths(repo: Path, paths: list[str]) -> dict[str, str]:
    return {p: file_fingerprint(repo, p) for p in paths}


def task_changed_paths(repo: Path, rec: dict[str, Any]) -> list[str]:
    current_head = git_head(repo)
    if rec.get("baseline_head") and rec["baseline_head"] != current_head:
        raise SystemExit(f"Git HEAD changed since begin: baseline={rec['baseline_head']}; current={current_head}")
    baseline = set(rec.get("baseline_changed_paths") or [])
    current = set(changed_paths(repo))
    baseline_hashes = rec.get("baseline_path_hashes") or {}
    touched = set(current - baseline)
    touched.update(baseline - current)
    for path in current & baseline:
        if file_fingerprint(repo, path) != baseline_hashes.get(path):
            touched.add(path)
    return sorted(touched)


def path_allowed(path: str, patterns: list[str]) -> bool:
    path = path.replace("\\", "/")
    for pattern in patterns:
        p = pattern.replace("\\", "/")
        if fnmatch.fnmatch(path, p):
            return True
        if p.endswith("/**") and (path == p[:-3] or path.startswith(p[:-2])):
            return True
    return False


def runnable_tasks(
    manifest: dict[str, Any],
    state: dict[str, Any],
    milestone: str | None = None,
    include_manual: bool = False,
) -> list[dict[str, Any]]:
    current = open_milestone(manifest, state)
    if current is None:
        return []
    target = normalize_milestone_id(milestone) if milestone else current["id"]
    if target != current["id"]:
        return []
    output: list[dict[str, Any]] = []
    for task in manifest["tasks"]:
        if task["milestone"] != target:
            continue
        rec = state["tasks"].get(task["id"], {})
        if rec.get("status") != "pending":
            continue
        if task.get("manual_gate") and not include_manual:
            continue
        if all(
            development_dependency(manifest, state, dep, task["id"])
            for dep in task["depends_on"]
        ):
            output.append(task)
    return output


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    ids = [t["id"] for t in manifest.get("tasks", [])]
    if len(ids) != len(set(ids)):
        errors.append("duplicate task IDs")
    known = set(ids)
    known_ms = {m["id"] for m in manifest.get("milestones", [])}
    policy = manifest.get("development_policy")
    if policy:
        if set(policy) != {"id", "deferred_tasks", "engineering_milestones", "joint_acceptance_after"}:
            errors.append("invalid development policy fields")
        for tid, consumers in policy.get("deferred_tasks", {}).items():
            task = next((t for t in manifest["tasks"] if t["id"] == tid), {})
            if not task.get("manual_gate") or not consumers or any(c not in known for c in consumers):
                errors.append(f"invalid development deferral {tid}: {consumers}")
        if any(ms not in known_ms for ms in policy.get("engineering_milestones", [])):
            errors.append("unknown engineering milestone")
        if policy.get("joint_acceptance_after") not in known:
            errors.append("unknown joint acceptance boundary")
    for t in manifest.get("tasks", []):
        if t.get("milestone") not in known_ms:
            errors.append(f"{t['id']} has unknown milestone {t.get('milestone')}")
        for dep in t.get("depends_on", []):
            if dep not in known:
                errors.append(f"{t['id']} has unknown dependency {dep}")
    graph = {t["id"]: t.get("depends_on", []) for t in manifest.get("tasks", [])}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        if node in visited:
            return
        if node in visiting:
            errors.append(f"dependency cycle at {node}")
            return
        visiting.add(node)
        for dep in graph.get(node, []):
            visit(dep)
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        visit(node)
    return errors


def validate_task_evidence(text: str, task: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if task["id"] not in text:
        errors.append("task ID missing from evidence")
    if not re.search(r"\*\*Status:\*\*\s*PASS\b", text, re.IGNORECASE):
        errors.append("evidence status must be PASS")
    for placeholder in TASK_EVIDENCE_PLACEHOLDERS:
        if placeholder in text:
            errors.append(f"unfilled placeholder: {placeholder}")
    if "## Commands and results" not in text:
        errors.append("commands/results section missing")
    if not re.search(r"\|[^\n|]+\|\s*PASS(?:\s*/[^|]*)?\s*\|", text, re.IGNORECASE):
        errors.append("at least one concrete PASS command/result row is required")
    if "## Completion decision" not in text:
        errors.append("completion decision section missing")
    if task.get("manual_gate"):
        if not re.search(
            r"\*\*Manual gate evidence:\*\*\s*PASS\b", text, re.IGNORECASE
        ):
            errors.append("manual-gate evidence line must be PASS")
    else:
        if not re.search(
            r"\*\*Manual gate evidence:\*\*\s*(?:PASS|NOT_REQUIRED)\b",
            text,
            re.IGNORECASE,
        ):
            errors.append("manual-gate evidence line must be PASS or NOT_REQUIRED")
    return errors


def validate_milestone_report(text: str, milestone_id: str) -> list[str]:
    errors: list[str] = []
    if milestone_id not in text:
        errors.append("milestone ID missing from report")
    if not re.search(r"\*\*Status:\*\*\s*PASS\b", text, re.IGNORECASE):
        errors.append("milestone report status must be PASS")
    for placeholder in MILESTONE_PLACEHOLDERS:
        if placeholder in text:
            errors.append(f"unfilled placeholder: {placeholder}")
    if "## Decision" not in text:
        errors.append("decision section missing")
    return errors


def path_inside_repo(repo: Path, candidate: Path) -> tuple[Path, str]:
    resolved_repo = repo.resolve()
    resolved = candidate.resolve()
    try:
        relative = resolved.relative_to(resolved_repo)
    except ValueError as exc:
        raise SystemExit(f"Path must be inside repository: {resolved}") from exc
    return resolved, str(relative).replace("\\", "/")


def validate_development_records(repo: Path, manifest: dict[str, Any], state: dict[str, Any]) -> list[str]:
    errors = []
    policy = development_policy(manifest, state)
    def valid_file(record: dict[str, Any], label: str) -> None:
        value = record.get("report")
        if not value:
            errors.append(f"{label}: report missing")
            return
        path, _ = path_inside_repo(repo, repo / value)
        if not path.is_file() or sha256_file(path) != record.get("sha256"):
            errors.append(f"{label}: evidence changed or missing")
    adoption = state.get("development_policy_adoption")
    if state.get("progress_model"):
        valid_file(state["progress_model"], "engineering/acceptance authorization")
    for tid, rec in state["tasks"].items():
        for key in ("acceptance_deferred", "acceptance_resolution"):
            if rec.get(key):
                valid_file(rec[key], f"{tid} {key}")
    for historical in state.get("development_policy_history", []):
        valid_file(historical, "historical policy adoption")
    if adoption:
        if not policy:
            errors.append("unknown policy adoption")
        valid_file(adoption, "policy adoption")
    for tid, rec in state.get("development_deferrals", {}).items():
        if tid not in policy.get("deferred_tasks", {}):
            errors.append(f"{tid}: unauthorized deferral")
        valid_file(rec, tid)
        evidence_path, _ = path_inside_repo(repo, repo / rec.get("report", "."))
        if evidence_path.is_file():
            data = json.loads(evidence_path.read_text(encoding="utf-8"))
            quality_path, _ = path_inside_repo(repo, repo / data.get("quality_report", "."))
            if not quality_path.is_file() or sha256_file(quality_path) != data.get("quality_sha256"):
                errors.append(f"{tid}: automation evidence changed or missing")
    for ms in manifest["milestones"]:
        engineering = state["milestones"].get(ms["id"], {}).get("engineering")
        if not engineering:
            continue
        if ms["id"] not in policy.get("engineering_milestones", []) or engineering.get("status") != "passed":
            errors.append(f"{ms['id']}: unauthorized engineering gate")
        valid_file(engineering, ms["id"])
        for tid in ms["task_ids"]:
            if state["tasks"][tid]["status"] != "completed" and not deferred_for_joint(manifest, state, tid):
                errors.append(f"{ms['id']}: incomplete non-deferred task {tid}")
    return errors


def cmd_adopt_development_policy(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, mh = load_manifest()
    state = load_state(repo)
    if state.get("active_task"):
        raise SystemExit("Cannot adopt governance policy during a product task")
    before_path, _ = path_inside_repo(repo, repo / args.before)
    before_text = before_path.read_text(encoding="utf-8")
    before = json.loads(before_text)
    stripped = dict(manifest)
    policy = stripped.pop("development_policy", None)
    before_graph = dict(before)
    before_graph.pop("development_policy", None)
    if policy == before.get("development_policy") and state.get("development_policy_adoption"):
        raise SystemExit("Policy already adopted; a new policy revision is required")
    if not policy or stripped != before_graph or state.get("manifest_sha256") != sha256_text(before_text):
        raise SystemExit("Only an additive policy on the exact ledger baseline may be adopted")
    previous_errors = validate_development_records(repo, before, state)
    if previous_errors:
        raise SystemExit("Prior governance evidence invalid: " + "; ".join(previous_errors))
    errors = validate_manifest(manifest)
    if errors:
        raise SystemExit("; ".join(errors))
    report, rel = path_inside_repo(repo, repo / args.report)
    authorization = json.loads(report.read_text(encoding="utf-8"))
    if authorization.get("policy") != policy or not authorization.get("user_authorization"):
        raise SystemExit("Authorization must record the exact policy and actual user instruction")
    if state.get("development_policy_adoption"):
        state.setdefault("development_policy_history", []).append(state["development_policy_adoption"])
    state["development_policy_adoption"] = {
        "id": policy["id"], "report": rel, "sha256": sha256_file(report),
        "policy_sha256": sha256_text(json.dumps(policy, ensure_ascii=False, sort_keys=True)),
        "previous_manifest_sha256": state["manifest_sha256"], "adopted_at": utc_now(),
    }
    state["manifest_sha256"] = mh
    new_errors = validate_development_records(repo, manifest, state)
    if new_errors:
        raise SystemExit("New policy would invalidate existing evidence: " + "; ".join(new_errors))
    save_state(repo, state)
    print(f"POLICY ADOPTED: {policy['id']}; task/milestone acceptance unchanged")
    return 0


def cmd_progress_model(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    if state.get("active_task") or state.get("progress_model"):
        raise SystemExit("Progress migration requires no active task and no previous migration")
    report, rel = path_inside_repo(repo, repo / args.report)
    data = json.loads(report.read_text(encoding="utf-8"))
    if data.get("model") != "ENGINEERING_ACCEPTANCE_V1" or not data.get("user_authorization"):
        raise SystemExit("Explicit dual-status authorization is required")
    state["progress_model"] = {"model": data["model"], "report": rel, "sha256": sha256_file(report), "recorded_at": utc_now()}
    save_state(repo, state)
    print("PROGRESS MODEL RECORDED: engineeringStatus and acceptanceStatus; no task/gate transitions")
    return 0


def cmd_acceptance(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    tid = task["id"]
    if state.get("active_task") or state["tasks"][tid]["status"] != "completed" or not acceptance_owed(state, tid):
        raise SystemExit("Acceptance resolution requires completed engineering, explicit debt and no active task")
    if not args.manual_evidence_confirmed:
        raise SystemExit("Actual acceptance requires --manual-evidence-confirmed; never infer user confirmation")
    report, rel = path_inside_repo(repo, repo / args.report)
    text = report.read_text(encoding="utf-8")
    errors = validate_task_evidence(text, {**task, "manual_gate": True})
    if "**Acceptance status:** ACCEPTANCE_PASSED" not in text:
        errors.append("Acceptance status must explicitly be ACCEPTANCE_PASSED")
    if errors:
        raise SystemExit("Evidence validation failed: " + "; ".join(errors))
    state["tasks"][tid]["acceptance_resolution"] = {"report": rel, "sha256": sha256_file(report), "recorded_at": utc_now()}
    save_state(repo, state)
    print(f"ACTUAL ACCEPTANCE RECORDED: {tid}; original deferred evidence retained")
    return 0


def cmd_defer_manual(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    tid = task["id"]
    if tid not in development_policy(manifest, state).get("deferred_tasks", {}):
        raise SystemExit("Task is not authorized for joint-acceptance deferral")
    if not task.get("manual_gate") or state["tasks"][tid]["status"] != "blocked" or state.get("active_task"):
        raise SystemExit("Deferral requires a blocked manual task and no active task")
    if any(not development_dependency(manifest, state, d, tid) for d in task["depends_on"]):
        raise SystemExit("Manual task's engineering dependencies are incomplete")
    report, rel = path_inside_repo(repo, repo / args.report)
    data = json.loads(report.read_text(encoding="utf-8"))
    if data.get("task") != tid or data.get("automation") != "PASS" or data.get("manual") not in {"NOT_RUN", "PARTIAL"}:
        raise SystemExit("Deferral evidence must distinguish automation PASS and incomplete manual acceptance")
    quality, _ = path_inside_repo(repo, repo / data["quality_report"])
    quality_data = json.loads(quality.read_text(encoding="utf-8"))
    if (quality_data.get("localQuality") != "PASS" or sha256_file(quality) != data.get("quality_sha256")
            or not quality_data.get("results")
            or not {"lint", "format:check", "typecheck", "test:unit", "test:contract", "test:integration", "test:coverage", "build", "test:e2e"}.issubset({c.get("name") for c in quality_data["results"]})
            or any(not (c.get("status") == "PASS" and c.get("exitCode") == 0)
                   and not (c.get("name") == "release:verify" and c.get("status") == "EXPECTED_BLOCK" and c.get("exitCode") == 2)
                   for c in quality_data["results"])):
        raise SystemExit("Deferral requires an intact fully executed passing automation report")
    state.setdefault("development_deferrals", {})[tid] = {
        "report": rel, "sha256": sha256_file(report), "recorded_at": utc_now(),
        "original_block_reason": state["tasks"][tid].get("note"), "manual": data["manual"],
    }
    save_state(repo, state)
    print(f"DEFERRED MANUAL ACCEPTANCE: {tid}; remains blocked, not completed")
    return 0


def cmd_engineering_gate(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    ms_id = normalize_milestone_id(args.milestone)
    policy = development_policy(manifest, state)
    if ms_id not in policy.get("engineering_milestones", []) or state.get("active_task"):
        raise SystemExit("Engineering gate not authorized or task still active")
    if not prior_development_gates(manifest, state, ms_id):
        raise SystemExit("Earlier engineering gate is incomplete")
    ms = milestone_map(manifest)[ms_id]
    missing = [tid for tid in ms["task_ids"] if state["tasks"][tid]["status"] != "completed" and not deferred_for_joint(manifest, state, tid)]
    if missing:
        raise SystemExit("Incomplete engineering tasks: " + ", ".join(missing))
    report, rel = path_inside_repo(repo, repo / args.report)
    text = report.read_text(encoding="utf-8")
    if ms_id not in text or "**Status:** ENGINEERING_PASS" not in text or "**Manual acceptance:** PENDING" not in text or "## Commands and results" not in text:
        raise SystemExit("Engineering report must explicitly retain pending manual acceptance")
    state["milestones"][ms_id]["engineering"] = {
        "status": "passed", "report": rel, "sha256": sha256_file(report), "recorded_at": utc_now(),
    }
    current = open_milestone(manifest, state)
    state["current_milestone"] = current["id"] if current else None
    save_state(repo, state)
    print(f"ENGINEERING GATE RECORDED: {ms_id}; overall acceptance remains {state['milestones'][ms_id]['status']}")
    return 0


def cmd_init(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, mh = load_manifest()
    path = state_path(repo)
    if path.exists() and not args.force:
        print(f"Ledger already exists: {path}")
        return 0
    now = utc_now()
    state = {
        "schema_version": STATE_SCHEMA_VERSION,
        "project": manifest["project"],
        "manifest_sha256": mh,
        "current_milestone": manifest["milestones"][0]["id"],
        "active_task": None,
        "created_at": now,
        "updated_at": now,
        "milestones": {
            m["id"]: {"status": "pending", "report": None, "passed_at": None}
            for m in manifest["milestones"]
        },
        "tasks": {
            t["id"]: {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "evidence": None,
                "note": None,
                "baseline_head": None,
                "baseline_changed_paths": [],
                "baseline_path_hashes": {},
            }
            for t in manifest["tasks"]
        },
    }
    save_state(repo, state)
    (repo / ".gesture-globe" / "evidence").mkdir(parents=True, exist_ok=True)
    (repo / ".gesture-globe" / "reports").mkdir(parents=True, exist_ok=True)
    print(f"Initialized {len(manifest['tasks'])} tasks at {path}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, mh = load_manifest()
    errors = validate_manifest(manifest)
    warnings: list[str] = []
    path = state_path(repo)
    if not path.exists():
        errors.append("ledger missing; run gg.py init")
    else:
        state = load_ready_state(repo, manifest)
        if state.get("manifest_sha256") != mh:
            errors.append("ledger manifest hash mismatch; reconcile before work")
        known = task_map(manifest)
        if set(state.get("tasks", {})) != set(known):
            errors.append("ledger task IDs do not match manifest")
        for tid, rec in state.get("tasks", {}).items():
            if rec.get("status") not in TASK_STATUSES:
                errors.append(f"{tid} has invalid status {rec.get('status')}")
        active = [
            tid
            for tid, rec in state.get("tasks", {}).items()
            if rec.get("status") == "in_progress"
        ]
        if len(active) > 1:
            errors.append(f"multiple in-progress tasks: {active}")
        if state.get("active_task") and state.get("active_task") not in active:
            errors.append("active_task does not match in-progress record")
        if active and state.get("active_task") != active[0]:
            errors.append("in-progress task is not recorded as active_task")
        gate_closed = False
        for ms in manifest["milestones"]:
            mrec = state["milestones"].get(ms["id"], {})
            status = mrec.get("status")
            if status not in MILESTONE_STATUSES:
                errors.append(f"{ms['id']} has invalid gate status {status}")
            if gate_closed and status == "passed":
                errors.append(f"{ms['id']} passed before an earlier milestone gate")
            if status != "passed":
                gate_closed = True
            if status == "passed":
                incomplete = [
                    tid
                    for tid in ms["task_ids"]
                    if state["tasks"][tid].get("status") != "completed" or acceptance_owed(state, tid)
                ]
                if incomplete:
                    errors.append(f"{ms['id']} passed with incomplete tasks: {incomplete}")
                report = mrec.get("report")
                if not report or not (repo / report).exists():
                    errors.append(f"{ms['id']} passed without an existing report")
                else:
                    report_errors = validate_milestone_report(
                        (repo / report).read_text(encoding="utf-8"), ms["id"]
                    )
                    errors.extend(f"{ms['id']} report: {e}" for e in report_errors)
        current = open_milestone(manifest, state)
        expected_current = current["id"] if current else None
        if state.get("current_milestone") != expected_current:
            errors.append(
                f"current_milestone mismatch: expected {expected_current}, "
                f"found {state.get('current_milestone')}"
            )
        if state.get("active_task"):
            active_task = known[state["active_task"]]
            if not deferred_for_joint(manifest, state, active_task["id"]) and (current is None or active_task["milestone"] != current["id"]):
                errors.append("active task is outside the open milestone")
        for tid, rec in state.get("tasks", {}).items():
            if rec.get("status") == "completed":
                for dep in known[tid]["depends_on"]:
                    if not development_dependency(manifest, state, dep, tid):
                        errors.append(f"{tid} completed before dependency {dep}")
                ev = rec.get("evidence")
                if not ev or not (repo / ev).exists():
                    errors.append(f"{tid} completed without existing evidence file")
                else:
                    ev_errors = validate_task_evidence(
                        (repo / ev).read_text(encoding="utf-8"), known[tid]
                    )
                    errors.extend(f"{tid} evidence: {e}" for e in ev_errors)
    req = repo / manifest["requirements_document"]
    if not req.exists():
        errors.append(
            f"requirements document missing: "
            f"{req.relative_to(repo) if req.is_relative_to(repo) else req}"
        )
    if not (repo / "AGENTS.md").exists():
        warnings.append("root AGENTS.md missing")
    git_result = run_git_bytes(repo, "status", "--porcelain=v1", "-z", allow_nonzero=True)
    if git_result.returncode != 0:
        warnings.append(
            "Git repository/status unavailable; begin/check-scope will refuse to run "
            f"until this is fixed ({git_result.diagnostic()})"
        )
    else:
        parse_status_paths(git_result)
    print(f"Repository: {repo}")
    print(f"Manifest tasks: {len(manifest['tasks'])}; sha256={mh}")
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        return 1
    print("VERIFY: PASS")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    counts: dict[str, int] = {}
    for rec in state["tasks"].values():
        counts[rec["status"]] = counts.get(rec["status"], 0) + 1
    if args.json:
        print(
            json.dumps(
                {"active_task": state.get("active_task"), "counts": counts, "state": state},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    print(f"Active task: {state.get('active_task') or '-'}")
    print("Overall: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    if state.get("progress_model"):
        refresh_progress(state)
        engineered = sum(rec["engineeringStatus"] == "ENGINEERING_COMPLETE" for rec in state["tasks"].values())
        deferred = [tid for tid, rec in state["tasks"].items() if rec["acceptanceStatus"] == "ACCEPTANCE_DEFERRED"]
        print(f"Engineering: {engineered}/{len(state['tasks'])}; acceptance deferred: {', '.join(deferred) or '-'}")
    for ms in manifest["milestones"]:
        rows = [(tid, state["tasks"][tid]["status"]) for tid in ms["task_ids"]]
        done = sum(1 for _, status in rows if status == "completed")
        blocked = [tid for tid, status in rows if status == "blocked"]
        active = [tid for tid, status in rows if status == "in_progress"]
        gate = state["milestones"][ms["id"]]["status"]
        engineering = state["milestones"][ms["id"]].get("engineering", {}).get("status", "pending")
        print(
            f"{ms['id']} {ms['name']}: {done}/{len(rows)} complete; gate={gate}"
            + (f"; active={active}" if active else "")
            + (f"; blocked={blocked}" if blocked else "")
            + (f"; engineering={engineering}; joint-manual-pending" if engineering == "passed" and gate != "passed" else "")
        )
    return 0


def cmd_next(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    tmap = task_map(manifest)
    if state.get("active_task"):
        task = tmap[state["active_task"]]
        print(f"{task['id']} | {task['milestone']} | {task['title']} [RESUME ACTIVE]")
        print(f"  completion: {task['completion_standard']}")
        return 0
    current = open_milestone(manifest, state)
    policy = development_policy(manifest, state)
    if policy and state["tasks"][policy["joint_acceptance_after"]]["status"] == "completed":
        owed = sorted(set(tid for tid in policy["deferred_tasks"] if deferred_for_joint(manifest, state, tid)) |
                      {tid for tid in state["tasks"] if acceptance_owed(state, tid)})
        if owed:
            print("JOINT MANUAL ACCEPTANCE REQUIRED: " + ", ".join(owed))
            return 0
    if current is None:
        print("No runnable engineering tasks remain; inspect overall milestone acceptance status.")
        return 0
    requested = normalize_milestone_id(args.milestone) if args.milestone else current["id"]
    if requested != current["id"]:
        print(
            f"Milestone {requested} is locked. The open milestone is {current['id']} "
            "and must pass its gate first."
        )
        return 1
    incomplete = [
        tid for tid in current["task_ids"] if state["tasks"][tid]["status"] != "completed"
    ]
    if current["id"] in policy.get("engineering_milestones", []) and not any(
        not deferred_for_joint(manifest, state, tid) for tid in incomplete
    ):
        print(f"Engineering tasks ready; acceptance remains pending. Record gg.py engineering-gate {current['id']} --report <engineering-report>")
        return 0
    if not incomplete:
        print(
            f"{current['id']} tasks are complete, but its milestone gate is not recorded. "
            f"Run: gg.py milestone {current['id']} --create-report"
        )
        return 0
    tasks = runnable_tasks(
        manifest, state, requested, args.include_manual
    )[: args.limit]
    if not tasks:
        manual = runnable_tasks(manifest, state, requested, include_manual=True)
        if manual:
            task = manual[0]
            print(
                f"Next runnable item is a manual gate: {task['id']} | {task['title']}. "
                "Use --include-manual only when the required real-world evidence can be collected."
            )
        else:
            blocked = [
                tid
                for tid in current["task_ids"]
                if state["tasks"][tid]["status"] == "blocked"
            ]
            print("No runnable tasks under the requested filter.")
            if blocked:
                print("Blocked: " + ", ".join(blocked))
        return 0
    for task in tasks:
        flag = " [MANUAL GATE]" if task.get("manual_gate") else ""
        print(f"{task['id']} | {task['milestone']} | {task['title']}{flag}")
        print(f"  completion: {task['completion_standard']}")
    return 0


def get_task(manifest: dict[str, Any], raw: str) -> dict[str, Any]:
    tid = normalize_task_id(raw)
    task = task_map(manifest).get(tid)
    if not task:
        raise SystemExit(f"Unknown task: {tid}")
    return task


def cmd_prompt(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    missing = [
        dep for dep in task["depends_on"] if not development_dependency(manifest, state, dep, task["id"])
    ]
    current = open_milestone(manifest, state)
    print(f"You are implementing {task['id']}: {task['title']}.")
    print(f"Milestone: {task['milestone']}")
    print(f"Open milestone: {current['id'] if current else 'none'}")
    print(f"Completion standard: {task['completion_standard']}")
    print(f"Dependencies: {', '.join(task['depends_on']) or 'none'}")
    print(f"Missing dependencies: {', '.join(missing) or 'none'}")
    print("Allowed paths:")
    for path in task["allowed_paths"]:
        print(f"- {path}")
    print("Protected paths:")
    for path in manifest["protected_paths"]:
        print(f"- {path}")
    print(f"Requirement prefixes: {', '.join(task['requirement_prefixes'])}")
    print("Suggested quality commands:")
    for command in task.get("default_gate_commands", []):
        print(f"- {command}")
    if task.get("manual_gate"):
        print(f"Manual gate: {task.get('manual_gate_note')}")
    print(
        "Required workflow: inspect -> begin -> implement -> targeted tests -> gates -> "
        "check-scope -> evidence -> complete/block."
    )
    return 0


def cmd_begin(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    tid = task["id"]
    current = open_milestone(manifest, state)
    if current is None and not deferred_for_joint(manifest, state, tid):
        raise SystemExit("All milestone gates are already passed")
    if not deferred_for_joint(manifest, state, tid) and (task["milestone"] != current["id"] or not prior_development_gates(
        manifest, state, task["milestone"]
    )):
        raise SystemExit(
            f"{tid} is locked behind milestone gate {current['id']}"
        )
    rec = state["tasks"][tid]
    if state.get("active_task") == tid and rec.get("status") == "in_progress":
        print(f"RESUME: {tid}")
        print("Original baseline and scope snapshot were preserved.")
        return 0
    if state.get("active_task"):
        raise SystemExit(f"Another task is active: {state['active_task']}")
    if rec["status"] == "completed":
        raise SystemExit(f"{tid} is already completed")
    if rec["status"] == "blocked":
        raise SystemExit(f"{tid} is blocked; run unblock after resolving the blocker")
    missing = [
        dep for dep in task["depends_on"] if not development_dependency(manifest, state, dep, tid)
    ]
    if missing:
        raise SystemExit(f"Dependencies incomplete: {', '.join(missing)}")
    baseline_paths = changed_paths(repo)
    rec.update(
        {
            "status": "in_progress",
            "started_at": rec.get("started_at") or utc_now(),
            "completed_at": None,
            "note": None,
            "baseline_head": git_head(repo),
            "baseline_changed_paths": baseline_paths,
            "baseline_path_hashes": snapshot_paths(repo, baseline_paths),
        }
    )
    state["active_task"] = tid
    state["current_milestone"] = current["id"] if current else None
    save_state(repo, state)
    print(f"BEGIN: {tid}")
    print(f"Baseline changed paths: {len(baseline_paths)}")
    return 0


def cmd_check_scope(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    rec = state["tasks"][task["id"]]
    if rec.get("status") != "in_progress":
        raise SystemExit(f"{task['id']} is not in_progress")
    touched = task_changed_paths(repo, rec)
    protected = [
        path for path in touched if path_allowed(path, manifest["protected_paths"])
    ]
    outside = [path for path in touched if not path_allowed(path, task["allowed_paths"])]
    print(f"Paths touched since begin ({len(touched)}):")
    for path in touched:
        print(f"- {path}")
    if protected:
        print("PROTECTED PATH VIOLATIONS:")
        for path in protected:
            print(f"- {path}")
    if outside:
        print("OUT-OF-SCOPE PATHS:")
        for path in outside:
            print(f"- {path}")
    if protected or outside:
        return 1
    print("SCOPE: PASS")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, mh = load_manifest()
    task = get_task(manifest, args.task)
    template = (SKILL_ROOT / "assets" / "task-report-template.md").read_text(
        encoding="utf-8"
    )
    content = (
        template.replace("TASK-XXX", task["id"])
        .replace("<title>", task["title"])
        .replace("MS-X", task["milestone"])
        .replace("<sha256>", mh)
        .replace("<YES/NO>", "YES" if task.get("manual_gate") else "NO")
    )
    path = repo / ".gesture-globe" / "evidence" / f"{task['id']}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not args.force:
        print(f"Report already exists: {path}")
        return 0
    path.write_text(content, encoding="utf-8")
    print(path.relative_to(repo))
    return 0


def cmd_complete(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    tid = task["id"]
    rec = state["tasks"][tid]
    if rec["status"] != "in_progress":
        raise SystemExit(f"{tid} is not in_progress")
    missing = [
        dep for dep in task["depends_on"] if not development_dependency(manifest, state, dep, tid)
    ]
    if missing:
        raise SystemExit(f"Dependencies incomplete: {', '.join(missing)}")
    evidence_input = Path(args.evidence)
    evidence_candidate = evidence_input if evidence_input.is_absolute() else repo / evidence_input
    evidence_abs, evidence_rel = path_inside_repo(repo, evidence_candidate)
    if not evidence_abs.exists():
        raise SystemExit(f"Evidence file does not exist: {evidence_abs}")
    evidence_text = evidence_abs.read_text(encoding="utf-8")
    evidence_errors = validate_task_evidence(evidence_text, task)
    deferred_acceptance = "**Acceptance status:** ACCEPTANCE_DEFERRED" in evidence_text
    if deferred_acceptance and (not state.get("progress_model") or task.get("manual_gate") or "## Deferred acceptance" not in evidence_text):
        evidence_errors.append("Deferred acceptance requires the dual-status model, a non-manual engineering task and an explicit remaining acceptance section; manual tasks use defer-manual")
    if evidence_errors:
        raise SystemExit("Evidence validation failed: " + "; ".join(evidence_errors))
    if task.get("manual_gate") and not args.manual_evidence_confirmed:
        raise SystemExit(
            "Manual-gate task requires --manual-evidence-confirmed after real evidence is recorded"
        )
    touched = task_changed_paths(repo, rec)
    bad = [
        path
        for path in touched
        if path_allowed(path, manifest["protected_paths"])
        or not path_allowed(path, task["allowed_paths"])
    ]
    if bad:
        raise SystemExit("Scope check failed: " + ", ".join(bad))
    rec.update(
        {
            "status": "completed",
            "completed_at": utc_now(),
            "evidence": evidence_rel,
            "note": args.note,
            "pending_manual_dependencies": [dep for dep in task["depends_on"] if deferred_for_joint(manifest, state, dep)],
        }
    )
    if deferred_acceptance:
        rec["acceptance_deferred"] = {"report": evidence_rel, "sha256": sha256_file(evidence_abs), "recorded_at": utc_now()}
    if task.get("manual_gate"):
        rec["manual_evidence_confirmed"] = True
    state["active_task"] = None
    save_state(repo, state)
    print(f"COMPLETE: {tid}")
    return 0


def cmd_block(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    rec = state["tasks"][task["id"]]
    if rec.get("status") == "completed":
        raise SystemExit(f"{task['id']} is already completed")
    rec.update({"status": "blocked", "note": args.reason, "completed_at": None})
    if state.get("active_task") == task["id"]:
        state["active_task"] = None
    save_state(repo, state)
    print(f"BLOCKED: {task['id']} — {args.reason}")
    return 0


def cmd_unblock(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, _ = load_manifest()
    state = load_ready_state(repo, manifest)
    task = get_task(manifest, args.task)
    rec = state["tasks"][task["id"]]
    if rec["status"] != "blocked":
        raise SystemExit(f"{task['id']} is not blocked")
    rec.update({"status": "pending", "note": None})
    save_state(repo, state)
    print(f"UNBLOCKED: {task['id']}")
    return 0


def cmd_milestone(args: argparse.Namespace) -> int:
    repo = find_repo(Path(args.repo) if args.repo else None)
    manifest, mh = load_manifest()
    state = load_ready_state(repo, manifest)
    ms_id = normalize_milestone_id(args.milestone)
    ms = milestone_map(manifest).get(ms_id)
    if not ms:
        raise SystemExit(f"Unknown milestone: {args.milestone}")
    if not prior_milestones_passed(manifest, state, ms_id):
        raise SystemExit(f"An earlier milestone gate must pass before {ms_id}")
    rows = [(tid, state["tasks"][tid]) for tid in ms["task_ids"]]
    print(f"{ms['id']} {ms['name']} — manifest {mh}")
    for tid, rec in rows:
        print(
            f"{tid}: {rec['status']}"
            + (f" | {rec.get('evidence')}" if rec.get("evidence") else "")
        )
    pending = [tid for tid, rec in rows if rec["status"] != "completed" or acceptance_owed(state, tid)]
    if pending:
        print("MILESTONE GATE: NOT READY")
        print("Incomplete: " + ", ".join(pending))
        return 1
    report_input = Path(args.report) if args.report else Path(
        ".gesture-globe/reports"
    ) / f"{ms['id']}.md"
    report_candidate = report_input if report_input.is_absolute() else repo / report_input
    report_abs, report_rel = path_inside_repo(repo, report_candidate)
    if args.create_report:
        template = (SKILL_ROOT / "assets" / "milestone-report-template.md").read_text(
            encoding="utf-8"
        )
        task_rows = "\n".join(
            f"| {tid} | {rec['status']} | {rec.get('evidence') or ''} |"
            for tid, rec in rows
        )
        content = (
            template.replace("MS-X", ms["id"])
            .replace("<name>", ms["name"])
            .replace("<sha256>", mh)
            .replace(
                "| TASK-XXX | completed/blocked/pending | path |",
                task_rows,
            )
        )
        report_abs.parent.mkdir(parents=True, exist_ok=True)
        if report_abs.exists() and not args.force:
            print(f"Report already exists: {report_rel}")
        else:
            report_abs.write_text(content, encoding="utf-8")
            print(f"Created milestone report: {report_rel}")
    if args.record:
        if not report_abs.exists():
            raise SystemExit(f"Milestone report does not exist: {report_rel}")
        report_errors = validate_milestone_report(
            report_abs.read_text(encoding="utf-8"), ms["id"]
        )
        if report_errors:
            raise SystemExit(
                "Milestone report validation failed: " + "; ".join(report_errors)
            )
        state["milestones"][ms["id"]] = {
            "status": "passed",
            "report": report_rel,
            "passed_at": utc_now(),
        }
        current = open_milestone(manifest, state)
        state["current_milestone"] = current["id"] if current else None
        save_state(repo, state)
        print(f"MILESTONE GATE RECORDED: {ms['id']} PASS")
        return 0
    if not args.create_report:
        print(
            f"All tasks complete. Run the documented gate and use report: {report_rel}. "
            f"Then record it with: gg.py milestone {ms['id']} --record --report {report_rel}"
        )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Gesture Globe task ledger")
    parser.add_argument("--repo", help="repository root; defaults to discovery from CWD")
    sub = parser.add_subparsers(dest="command", required=True)

    cmd = sub.add_parser("init")
    cmd.add_argument("--force", action="store_true")
    cmd.set_defaults(func=cmd_init)

    cmd = sub.add_parser("verify")
    cmd.set_defaults(func=cmd_verify)

    cmd = sub.add_parser("status")
    cmd.add_argument("--json", action="store_true")
    cmd.set_defaults(func=cmd_status)

    cmd = sub.add_parser("next")
    cmd.add_argument("--limit", type=int, default=3, choices=range(1, 11))
    cmd.add_argument("--milestone")
    cmd.add_argument("--include-manual", action="store_true")
    cmd.set_defaults(func=cmd_next)

    cmd = sub.add_parser("prompt")
    cmd.add_argument("task")
    cmd.set_defaults(func=cmd_prompt)

    cmd = sub.add_parser("begin")
    cmd.add_argument("task")
    cmd.set_defaults(func=cmd_begin)

    cmd = sub.add_parser("check-scope")
    cmd.add_argument("task")
    cmd.set_defaults(func=cmd_check_scope)

    cmd = sub.add_parser("report")
    cmd.add_argument("task")
    cmd.add_argument("--force", action="store_true")
    cmd.set_defaults(func=cmd_report)

    cmd = sub.add_parser("complete")
    cmd.add_argument("task")
    cmd.add_argument("--evidence", required=True)
    cmd.add_argument("--note")
    cmd.add_argument("--manual-evidence-confirmed", action="store_true")
    cmd.set_defaults(func=cmd_complete)

    cmd = sub.add_parser("block")
    cmd.add_argument("task")
    cmd.add_argument("--reason", required=True)
    cmd.set_defaults(func=cmd_block)

    cmd = sub.add_parser("unblock")
    cmd.add_argument("task")
    cmd.set_defaults(func=cmd_unblock)

    cmd = sub.add_parser("adopt-development-policy")
    cmd.add_argument("--before", required=True)
    cmd.add_argument("--report", required=True)
    cmd.set_defaults(func=cmd_adopt_development_policy)

    cmd = sub.add_parser("defer-manual")
    cmd.add_argument("task")
    cmd.add_argument("--report", required=True)
    cmd.set_defaults(func=cmd_defer_manual)

    cmd = sub.add_parser("engineering-gate")
    cmd.add_argument("milestone")
    cmd.add_argument("--report", required=True)
    cmd.set_defaults(func=cmd_engineering_gate)

    cmd = sub.add_parser("progress-model")
    cmd.add_argument("--report", required=True)
    cmd.set_defaults(func=cmd_progress_model)

    cmd = sub.add_parser("acceptance")
    cmd.add_argument("task")
    cmd.add_argument("--report", required=True)
    cmd.add_argument("--manual-evidence-confirmed", action="store_true")
    cmd.set_defaults(func=cmd_acceptance)

    cmd = sub.add_parser("milestone")
    cmd.add_argument("milestone")
    cmd.add_argument("--create-report", action="store_true")
    cmd.add_argument("--record", action="store_true")
    cmd.add_argument("--report")
    cmd.add_argument("--force", action="store_true")
    cmd.set_defaults(func=cmd_milestone)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
