#!/usr/bin/env python3
"""Validate .agents/skills/* against the Agent Skills specification + best practices.

Reference rules researched 2026-08-23 from:
  - https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
  - https://agentskills.io/specification
    (frontmatter rules, name/description constraints, <500-line body, references/)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / ".agents" / "skills"
RESERVED = {"anthropic", "claude"}
FAIL = 0


def check(name: str, ok: bool, detail: str):
    global FAIL
    print(("  OK  " if ok else "  FAIL") + f"  [{name}] {detail}")
    if not ok:
        FAIL += 1


for skill_dir in sorted(ROOT.iterdir()):
    if not skill_dir.is_dir():
        continue
    shell = skill_dir / "SKILL.md"
    print(f"\n=== {skill_dir.name}/SKILL.md ({shell.stat().st_size} bytes, "
          f"{len(shell.read_text().splitlines())} lines) ===")
    text = shell.read_text()

    # Frontmatter: must start at byte 0 with --- and close with \n---\n
    check("fm-begin", text.startswith("---"), "starts with --- at byte 0")
    m = re.search(r"\n---\s*\n", text[3:])
    check("fm-close", m is not None, "frontmatter closes with \\n---\\n")
    fm_ok = text.startswith("---") and m is not None
    fm = {}
    if fm_ok:
        try:
            import yaml
            fm = yaml.safe_load(text[3:m.start() + 3]) or {}
        except Exception as e:
            check("fm-parse", False, f"YAML parse: {e}")
            fm = {}
    check("fm-parse", bool(fm), "frontmatter parses to a mapping")

    # name
    nm = fm.get("name", "")
    check("name-present", isinstance(nm, str) and nm, f"name present ({nm!r})")
    check("name-format", bool(re.fullmatch(r"[a-z0-9-]+", nm)), "lowercase letters/numbers/hyphens only")
    check("name-len", len(nm) <= 64, f"name <= 64 chars ({len(nm)})")
    check("name-hyphens", not nm.startswith("-") and not nm.endswith("-") and "--" not in nm,
          "no leading/trailing/consecutive hyphens")
    check("name==dirname", nm == skill_dir.name, "name matches parent directory name")
    check("name-reserved", not any(w in nm.lower() for w in RESERVED), "no reserved words (claude/anthropic)")

    # description
    desc = fm.get("description", "")
    check("desc-present", isinstance(desc, str) and desc.strip(), "description present")
    check("desc-len", len(desc) <= 1024, f"description <= 1024 chars ({len(desc)})")
    check("desc-nonxml", "<" not in desc or ">" not in desc, "no XML tags in description")

    # optional fields present (best practice: version, author, license)
    for f in ("version", "author", "license"):
        check(f"fm-{f}", f in fm and fm[f], f"optional frontmatter field '{f}' present")

    # Body: under 500 lines for optimal performance (progressive disclosure)
    body = text[text.find("\n---", 3) + 5:] if fm_ok else text
    nlines = len([l for l in body.splitlines() if l.strip()])
    check("body<500", len([l for l in text.splitlines() if l.strip()]) <= 500,
          f"body under 500 lines ({nlines} non-blank)")

    # Best-practice structure signals
    check("has-h1", bool(re.search(r"^# ", body, re.M)), "has an H1 title")
    check("no-machplocal", "/home/" not in text and "~/workspace" not in text,
          "no machine-local paths (repo-relative only)")

    # Progressive disclosure: if a references/ dir exists, it must be linked from SKILL.md
    refs_dir = skill_dir / "references"
    if refs_dir.is_dir():
        ref_files = [p.name for p in refs_dir.glob("*.md")]
        check("refs-exist", len(ref_files) > 0,
              f"references/ present: {', '.join(ref_files)}")
        # every reference file must be referenced (by relative path) in the body
        missing_links = [f for f in ref_files if f"({refs_dir.name}/{f})" not in text]
        check("refs-linked", not missing_links,
              f"every reference file linked in SKILL.md body"
              + (f" (unlinked: {missing_links})" if missing_links else ""))
        # one level deep only (no nested reference chains)
        nested = [str(p.relative_to(skill_dir)) for p in refs_dir.rglob("*") if p.is_dir()]
        check("refs-onelevel", not nested, "no nested reference subdirectories")
    else:
        check("refs-optional", True, "no references/ (small skill, body self-contained)")

print(f"\n{'ALL SKILLS VALID' if FAIL == 0 else f'{FAIL} CHECK(S) FAILED'}")
sys.exit(0 if FAIL == 0 else 1)
