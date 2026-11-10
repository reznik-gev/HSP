---
name: record-decision
description: Write an HSP decision record. Claim its number with a reservation branch so parallel sessions don't clash, write it in the log's format with the owner's and Claude's choices marked, and update the index and the records it refines. Use whenever a change makes or changes a product or technical decision, or the owner says "record this", "write a decision" or "add a record".
---

# Write a decision record

Every product and technical decision is a numbered record in [docs/decisions/](../../../docs/decisions/README.md). Several sessions write records at the same time, so the number is claimed on GitHub first ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)). Do these steps in order.

## 1. Get the decisions first
- Ask the owner what is theirs to decide: scope, order, behaviour users notice. One question at a time, with options, trade-offs and a recommendation (CLAUDE.md, "Working with the product owner").
- Small details you're sure about, decide yourself. You'll mark them *(Claude's choice)*.
- Read the records the decision touches, and any it refines or supersedes.

## 2. Claim the number
Find the highest number taken anywhere:
```bash
git fetch origin
git ls-tree --name-only origin/main docs/decisions/ | grep -E '/[0-9]{4}-' | tail -1   # on main
for p in $(gh pr list --state open --json number --jq '.[].number'); do gh pr diff $p --name-only | grep -E '^docs/decisions/[0-9]{4}'; done
git ls-remote origin 'refs/heads/reserve/decision-*'
```
Take the next number, `NNNN`. Then claim it with an empty commit on top of `origin/main`. The message says what the record is about and which branch it's for:
```bash
sha=$(git commit-tree "origin/main^{tree}" -p origin/main -m "Reserve decision NNNN: <subject> (<branch>)")
git push origin "$sha:refs/heads/reserve/decision-NNNN"
```
- If GitHub refuses the push, another session holds that number. Take the next one and try again.
- **Never force-push a `reserve/` branch.** That takes a number away from another session.
- [`merge-pr`](../merge-pr/SKILL.md) deletes them after the PR merges or closes.

## 3. Write the record
File: `docs/decisions/NNNN-YYYY-MM-DD-short-slug.md`, dated today. Follow the shape of recent records, such as [0130](../../../docs/decisions/0130-2026-11-08-learning-the-editor.md):
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
- Plain English: short sentences, no jargon the reader needs to look up.
- Use the status `Accepted` once the owner has answered the questions. Use `Proposed` while something is still open.

## 4. Update the records around it
- Add a row to the index in [docs/decisions/README.md](../../../docs/decisions/README.md).
- For each record this one **refines**: add or extend its `Refined by:` line, and its index row may name this record. For each record this one **supersedes**: set its status to `Superseded by NNNN`, in the record and the index.
- Change nothing else in an accepted record. Only its status, a `Refined by:` line, a dated note at the end, or a rename the owner approved may change ([0126](../../../docs/decisions/0126-2026-11-08-what-may-change-in-an-accepted-record.md)).

## 5. Tell the owner
List the *(Claude's choice)* points in your reply, so the owner can check them early, before other work builds on them.
