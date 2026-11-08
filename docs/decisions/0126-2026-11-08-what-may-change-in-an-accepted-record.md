# 0126 — What may change in an accepted decision record

- **Date:** 2026-11-08
- **Status:** Accepted
- **Refines:** [0072](0072-2026-10-08-rename-hsm-to-hsp.md) (renames in place)

## Context
The log's rule was that an accepted record is never edited. The one exception was a pure rename, recorded in a record of its own ([0072](0072-2026-10-08-rename-hsm-to-hsp.md)).

That keeps each record a true picture of what was decided that day. But a reader who opens an old record can't tell what later records changed. The decision records review of October 2026 (#123) found 50 records refined or partly replaced with no pointer to the record that did it. Only the index rows sometimes say so, and a reader who follows a `docs/NNNN` link from the code never sees the index.

## Decision
The owner's choice: **an accepted record stays frozen, as a rule of thumb.** What it decided is never changed in place. To change a decision, add a new record that refines or supersedes it. Three kinds of edit are allowed:

1. **Its status.** The status line moves to `Superseded by NNNN` or `Deprecated` when that happens, and its index row says the same. No approval needed.
2. **Dated notes, added at the end.** A record may get an `## Updates` section as its last section. Each note starts *Update, YYYY-MM-DD:*, then says what happened later, with a link: a later record that refined or partly replaced it, or something it names that was renamed or removed. A note never changes the decision. The text above it stays as written. No approval needed.
3. **Rename fixes that don't change the subject**, only with the owner's explicit yes. For example: the product's name, a renamed module or setting, or a title that names the subject badly. A rename never changes what was decided. *(Claude's choice, lower confidence:)* a rename no longer needs a record of its own, as 0072 asked. The PR says the owner approved it, and a dated note in each renamed record says what was renamed.

Anything else, such as rewording, correcting or adding to what was decided, needs a new record.

## Consequences
- Old records can point forward to the records that changed them, without being rewritten.
- The rule is stated in the [decision log's README](README.md), in CLAUDE.md and in the `prepare-pr-for-review` skill.
- 0072 gets a dated note pointing here, as the first use of this rule.
