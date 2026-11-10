---
name: record-decision
description: Write an HSP decision record. Claim its number, write it, and update the index and the records it refines. Use whenever a change makes or changes a product or technical decision, or the owner says "record this" or "write a decision".
---

# Write a decision record

Do these steps in order.

## 1. Get the decisions first
Get the owner's answers to what is theirs to decide (CLAUDE.md, "Working with the product owner"). Read the records the decision touches, and any it refines or supersedes.

## 2. Claim the number
Find the highest number taken anywhere:
```bash
git fetch origin
git ls-tree --name-only origin/main docs/decisions/ | grep -E '/[0-9]{4}-' | tail -1   # on main
for p in $(gh pr list --state open --json number --jq '.[].number'); do gh pr diff $p --name-only | grep -E '^docs/decisions/[0-9]{4}'; done
git ls-remote origin 'refs/heads/reserve/decision-*'
```
Take the next number, `NNNN`, and claim it with an empty commit on top of `origin/main`:
```bash
sha=$(git commit-tree "origin/main^{tree}" -p origin/main -m "Reserve decision NNNN: <subject> (<branch>)")
git push origin "$sha:refs/heads/reserve/decision-NNNN"
```
- If GitHub refuses the push, another session holds that number. Take the next one and try again.
- **Never force-push a `reserve/` branch.** That takes a number away from another session.

## 3. Write the record
File: `docs/decisions/NNNN-YYYY-MM-DD-short-slug.md`, dated today:
```markdown
# NNNN — <the decision as a short statement>

- **Date:** YYYY-MM-DD
- **Status:** Accepted
- **Refines:** [MMMM](MMMM-....md) (what it refines)       ← or Supersedes, if any

## Context
Why this came up, and what's true today. Link the demo notes, review or PR that raised it.

## Options considered
- **The chosen option** ✅
- Each other option, with why it was set aside.

## Decision
What was decided. Mark each point *(The owner's choice)* or *(Claude's choice)*.

## Consequences
What follows: code, guides or records that change, and work left for later.
```
Use `Proposed` instead of `Accepted` while a question is still open.

## 4. Update the records around it
- Add a row to the index in [docs/decisions/README.md](../../../docs/decisions/README.md).
- For each record this one **refines**: add or extend its `Refined by:` line. Its index row may name this record. For each record this one **supersedes**: set its status to `Superseded by NNNN`, in the record and the index.
- Change nothing else in an accepted record ([0126](../../../docs/decisions/0126-2026-11-08-what-may-change-in-an-accepted-record.md)).

## 5. Tell the owner
List the *(Claude's choice)* points in your reply, so the owner can check them before other work builds on them.
