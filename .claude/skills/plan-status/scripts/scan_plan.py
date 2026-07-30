#!/usr/bin/env python3
"""Scan the phase plans under docs/superpowers/plans/ and emit a compact JSON
status scan: task ledger, per-task evidence, amendments, and git position.

This does the *mechanical* half of a status check — parsing, file existence,
commit matching. It deliberately does NOT decide whether a task is done; it
reports evidence and lets the caller judge the frontier. See SKILL.md.

Usage:
    python .claude/skills/plan-status/scripts/scan_plan.py [--plan PATH] [--base BRANCH]
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, check=True,
    )
    return Path(out.stdout.strip())


def git(*args: str, cwd: Path) -> str:
    out = subprocess.run(["git", *args], capture_output=True, text=True, cwd=cwd)
    return out.stdout.strip() if out.returncode == 0 else ""


# --- plan parsing ----------------------------------------------------------

TASK_RE = re.compile(r"^##\s+Task\s+(\d+)\s*[:—-]\s*(.+?)\s*$", re.M)
COMMIT_RE = re.compile(r'git commit -m ["\'](.+?)["\']')
PATH_RE = re.compile(r"`([^`]+\.[A-Za-z0-9]+)`")
PRODUCES_RE = re.compile(r"^-\s*Produces:\s*(.+)$", re.M)
STEP_RE = re.compile(r"^-\s*\[( |x|X)\]\s*\*\*(.+?)\*\*", re.M)


def is_complete(text: str) -> bool:
    """A finished plan announces itself in the title or a Status line."""
    head = text[:1200]
    if re.search(r"^#\s+.*\(COMPLETE\)", head, re.M):
        return True
    return bool(re.search(r"^\*\*Status:\*\*\s*all\s+\d+\s+tasks?\s+shipped", head, re.M))


def parse_amendments(text: str, lines: list[str]) -> list[dict]:
    """Amendment blocks supersede the snippets below them — surfacing these is
    the difference between following the plan and following a stale plan."""
    out = []
    for m in re.finditer(r"^>\s*\*\*(Amendment[^*]*)\*\*(.*)$", text, re.M):
        line_no = text[: m.start()].count("\n") + 1
        body = []
        for ln in lines[line_no - 1 : line_no + 12]:
            if not ln.startswith(">"):
                break
            body.append(ln.lstrip("> ").rstrip())
        out.append({
            "line": line_no,
            "title": m.group(1).strip(),
            "body": " ".join(body)[:600],
        })
    return out


def resolve_paths(files_block: str, index: dict[str, list[str]]) -> list[str]:
    """The plan writes continuation paths — `.../patterns/PostCard.tsx`, `EmptyState.tsx`
    — where a bare filename inherits the previous path's directory. Taking those
    literally makes shipped tasks look unstarted, so resolve them in reading order
    against the last directory seen, then fall back to a unique basename match."""
    resolved, last_dir = [], ""
    for raw in PATH_RE.findall(files_block):
        p = raw.strip()
        if p.startswith("./"):
            p = p[2:]
        base = p.rsplit("/", 1)[-1]
        hits = index.get(base, [])

        if "/" in p:
            # Plans abbreviate ("src/index.css" for "apps/client/src/index.css"),
            # so accept a unique suffix match before calling it missing.
            suffix = [h for h in hits if h == p or h.endswith("/" + p)]
            chosen = p if p in hits else (suffix[0] if len(suffix) == 1 else p)
        elif last_dir and f"{last_dir}/{base}" in hits:
            chosen = f"{last_dir}/{base}"
        elif len(hits) == 1:
            chosen = hits[0]
        elif hits and last_dir:
            # e.g. `.env.example` exists under both apps/*; pick the one sharing
            # the most path with where we already are.
            chosen = max(hits, key=lambda h: len(os.path.commonprefix([h, last_dir])))
        else:
            chosen = f"{last_dir}/{base}" if last_dir else base

        if "/" in chosen:
            last_dir = chosen.rsplit("/", 1)[0]
        resolved.append(chosen)
    return sorted(set(resolved))


def parse_tasks(text: str, lines: list[str], index: dict[str, list[str]]) -> list[dict]:
    marks = [(m.start(), int(m.group(1)), m.group(2)) for m in TASK_RE.finditer(text)]
    tasks = []
    for i, (start, num, title) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        block = text[start:end]
        line_no = text[:start].count("\n") + 1

        files_m = re.search(r"\*\*Files:\*\*(.*?)(?:\n\s*\n|\*\*Interfaces)", block, re.S)
        files = resolve_paths(files_m.group(1), index) if files_m else []

        produces_m = PRODUCES_RE.search(block)
        produces = produces_m.group(1).strip() if produces_m else ""

        commits = COMMIT_RE.findall(block)
        steps = [{"checked": c.lower() == "x", "title": t} for c, t in STEP_RE.findall(block)]

        tasks.append({
            "num": num,
            "title": title.strip(),
            "line": line_no,
            "end_line": text[:end].count("\n") + 1,
            "files": files,
            "produces": produces,
            "commit_msgs": commits,
            "steps": steps,
            "mentions_stub": "stub" in block.lower(),
        })
    return tasks


# --- evidence --------------------------------------------------------------

STOP = {"feat", "fix", "chore", "docs", "refactor", "test", "client", "server",
        "api", "and", "the", "a", "an", "with", "for", "to", "of", "in", "on"}


def tokens(subject: str) -> set[str]:
    subject = re.sub(r"^[a-z]+(\([^)]*\))?!?:\s*", "", subject.lower())
    return {w for w in re.findall(r"[a-z0-9]+", subject) if w not in STOP and len(w) > 2}


def match_commit(planned: str, log: list[tuple[str, str]]) -> dict | None:
    """Commit subjects drift from what the plan prescribed (the plan says
    'blog feed page and PostCard', the real commit says 'blog feed with
    PostCard and gating prompt'), so match on token overlap, not equality."""
    want = tokens(planned)
    if not want:
        return None
    best, best_score = None, 0.0
    for sha, subject in log:
        score = len(want & tokens(subject)) / len(want)
        if score > best_score:
            best, best_score = (sha, subject), score
    if best and best_score >= 0.7:
        return {"sha": best[0], "subject": best[1], "confidence": round(best_score, 2)}
    return None


def build_index(root: Path) -> dict[str, list[str]]:
    """basename -> tracked paths. git ls-files keeps node_modules out for free."""
    index: dict[str, list[str]] = {}
    for line in git("ls-files", cwd=root).splitlines():
        index.setdefault(line.rsplit("/", 1)[-1], []).append(line)
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", help="path to a specific plan file (default: the active one)")
    ap.add_argument("--base", default="master", help="branch the merged work lands beyond (default: master)")
    args = ap.parse_args()

    root = repo_root()
    plans_dir = root / "docs" / "superpowers" / "plans"
    if not plans_dir.is_dir():
        print(json.dumps({"error": f"no plans directory at {plans_dir}"}))
        return 1

    all_plans = sorted(plans_dir.glob("*.md"))
    catalog = []
    for p in all_plans:
        t = p.read_text(encoding="utf-8", errors="replace")
        catalog.append({"path": str(p.relative_to(root)).replace("\\", "/"),
                        "complete": is_complete(t)})

    if args.plan:
        plan_path = Path(args.plan)
        if not plan_path.is_absolute():
            plan_path = root / plan_path
    else:
        active = [c for c in catalog if not c["complete"]]
        if not active:
            print(json.dumps({"plans": catalog, "active_plan": None,
                              "note": "every plan reports itself complete"}, indent=2))
            return 0
        plan_path = root / active[-1]["path"]

    text = plan_path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    tasks = parse_tasks(text, lines, build_index(root))

    branch = git("rev-parse", "--abbrev-ref", "HEAD", cwd=root)
    log_raw = git("log", "--oneline", "--no-merges", "-80", cwd=root)
    log = []
    for ln in log_raw.splitlines():
        sha, _, subject = ln.partition(" ")
        log.append((sha, subject))

    merged_raw = git("log", "--oneline", "--no-merges", f"{args.base}..HEAD", cwd=root)
    merged_shas = {ln.split(" ", 1)[0] for ln in merged_raw.splitlines()}

    for t in tasks:
        t["file_status"] = {
            f: ("present" if (root / f).exists() else "MISSING") for f in t["files"]
        }
        hits = [h for h in (match_commit(m, log) for m in t["commit_msgs"]) if h]
        for h in hits:
            h["on_current_branch"] = h["sha"] in merged_shas
        t["commit_evidence"] = hits
        missing = [f for f, s in t["file_status"].items() if s == "MISSING"]
        # Two independent axes: do the artifacts exist, and did something ship them.
        # They only agree at the extremes; the disagreements are exactly the tasks
        # worth verifying by hand, so name them rather than guessing.
        if not t["files"] and not hits:
            t["signal"] = "NO_EVIDENCE"
        elif missing and not hits:
            t["signal"] = "NOT_STARTED"
        elif not missing and hits:
            t["signal"] = "LIKELY_DONE"
        else:
            t["signal"] = "NEEDS_CHECK"          # mixed — verify against Produces

    result = {
        "plans": catalog,
        "active_plan": str(plan_path.relative_to(root)).replace("\\", "/"),
        "plan_title": lines[0].lstrip("# ").strip() if lines else "",
        "plan_lines": len(lines),
        "task_count": len(tasks),
        "checkbox_stats": {
            "checked": text.count("- [x]") + text.count("- [X]"),
            "unchecked": text.count("- [ ]"),
        },
        "git": {
            "branch": branch,
            "base": args.base,
            "dirty": bool(git("status", "--porcelain", cwd=root)),
            "ahead_of_base": len(merged_shas),
            "recent": [f"{s} {m}" for s, m in log[:12]],
        },
        "amendments": parse_amendments(text, lines),
        "tasks": tasks,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
