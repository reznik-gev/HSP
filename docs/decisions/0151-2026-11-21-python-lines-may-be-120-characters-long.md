# 0151 — Python lines may be 120 characters long

- **Date:** 2026-11-21
- **Status:** Accepted
- **Refines:** [0062](0062-2026-10-08-code-quality-tooling.md) (Ruff's line length)

## Context
Ruff checks and formats the Python code in `backend/` and `backup/` ([0062](0062-2026-10-08-code-quality-tooling.md)). Its line length was 100 characters, set in both `pyproject.toml` files.

The rename to Musical Chairs ([0150](0150-2026-11-21-rename-hsp-to-musical-chairs.md), PR #182) made names longer: `hsp` became `musical_chairs`, and `HSP_` became `MUSICAL_CHAIRS_`. Many lines went over 100. Ruff split the code lines, but comments and docstrings had to be split by hand. Sentences broke in odd places, and imports that fit on one line became six.

The owner saw this while reviewing #182 and asked for 120.

## Options considered
- Keep 100. Set aside: the awkward splits from the rename stay.
- **120** ✅
- 88 or 99, the defaults of Black and of some other projects. Set aside: shorter still, so more splits.

## Decision
- **Ruff's line length is 120**, in both `backend/pyproject.toml` and `backup/pyproject.toml`. *(The owner's choice)*
- **The change is its own PR, stacked on #182.** It merges after #182, so the rename PR stays as it is. *(The owner's choice)*
- **In that PR, `ruff format` runs once over all Python files**, so `ruff format --check` stays green in CI. The lines the rename split only because of the longer names are joined again, so they read as before with only the name changed. Lines the original authors wrapped at 100 stay as they are. *(Claude's choice, lower-confidence)*
- **Other limits stay as they are:** a commit's summary line is still at most 100 characters ([0148](0148-2026-11-18-every-commit-message-has-a-body.md) and its hook), the frontend's Prettier width stays 100, and `migrations/versions/` stays exempt from Ruff's line-length rule (E501). *(Claude's choice)*

## Consequences
- 127 Python files change (108 in `backend/`, 19 in `backup/`). No behaviour changes.
- `git blame` on the reformatted lines points to this PR, not to the commit that wrote them. #182 itself stays as it was reviewed.
- New code may use lines up to 120 characters. Older lines wrapped at 100 are not rewrapped on purpose; they change only when someone edits them.
