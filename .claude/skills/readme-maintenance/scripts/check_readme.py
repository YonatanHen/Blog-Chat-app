#!/usr/bin/env python3
"""
Gathers mechanical evidence for whether README.md needs an update before a PR opens or when user explicitly ask.

Usage:
    python .claude/skills/readme-maintenance/scripts/check_readme.py [--base BRANCH]

Prints JSON. This script only gathers facts — it never edits README.md and never
decides whether an update is warranted. That judgment call (does this diff actually
touch one of the six tracked README sections?) belongs to whoever is running the
skill, informed by this output.
"""
import argparse
import json
import subprocess


def run(cmd: str) -> str:
    return subprocess.run(
        cmd, shell=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base",
        default="origin/staging",
        help="Branch this feature branch is stacked on (default: origin/staging).",
    )
    args = parser.parse_args()

    base = args.base
    merge_base = run(f"git merge-base {base} HEAD") or base

    changed_files = [f for f in run(f"git diff --name-only {merge_base}..HEAD").splitlines() if f]
    readme_touched = "README.md" in changed_files

    commits = [c for c in run(f"git log --oneline {merge_base}..HEAD").splitlines() if c]

    package_json_files = [f for f in changed_files if f.endswith("package.json")]
    package_json_diff = (
        run(f"git diff {merge_base}..HEAD -- {' '.join(package_json_files)}")
        if package_json_files
        else ""
    )

    # New top-level directories under apps/ or packages/ are the strongest signal
    # of an architecture-diagram-worthy change (a new service, a new shared package).
    new_top_level_dirs = sorted(
        {
            f.split("/", 2)[1]
            for f in changed_files
            if f.startswith(("apps/", "packages/")) and len(f.split("/")) > 2
        }
    )

    result = {
        "base": base,
        "merge_base": merge_base,
        "readme_already_touched_on_this_branch": readme_touched,
        "changed_files": changed_files,
        "commit_subjects": commits,
        "package_json_files_changed": package_json_files,
        "package_json_diff": package_json_diff,
        "apps_or_packages_touched": new_top_level_dirs,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()