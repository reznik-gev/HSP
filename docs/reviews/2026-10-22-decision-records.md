# Decision records review, October 2026

- **Date:** 2026-10-22
- **Records reviewed:** 0001–0107, as on commit `3e3a3ec`
- **Part of:** the [maintainability review](2026-10-22-maintainability.md). The owner asked how easy it is, with this many records, to find the rule in force today.

## Summary

The log does its main job well. Every choice has a record, the index lists all 107, and the code points to them over 900 times. **The problem is reading forwards.** A record shows what was decided that day, but often not what later records changed. **50 records were later refined or partly replaced without pointing to the record that did it.** To know today's rule on a topic, a reader has to know which later records to look for.

| # | Recommendation | Size |
|---|---|---|
| 1 | Generate a "Changed by" column in the index from the `Refines` / `Supersedes` / `Amends` lines, and check it in CI | Small |
| 2 | Check in CI that every `docs/NNNN` in the code names a record that exists | Small |
| 3 | Later, if the log keeps growing: one short "rules in force" page per area, linking to the records | Medium, plus upkeep |

## 1. The log in numbers

| | |
|---|---|
| Records | 107, in two weeks |
| Length | about 38,000 words in all: roughly three hours to read. The shortest is 91 words (0026, line endings), the longest 1,089 (0087, frontend delivery plan). |
| Status | 104 Accepted, 3 Superseded (0023, 0079, 0100) |
| Links between records | 34 `Refines`, 7 `Supersedes`, 6 `Builds on`, 2 `Implements`, 1 `Amends`, and in the other direction only 3 `Refined by` and 1 `Amended by`. Some lines give ranges (`0042–0052`), which a reader has to expand. |
| References from the code | 903 `docs/NNNN` comments, naming 76 of the 107 records |

## 2. What works

- **Every record has the same shape** (context, options, decision, consequences), so a reader knows where to look.
- **The index is complete.** All 107 records have a row, and the rows for partly replaced records say so. For example, 0064's row reads "merge method superseded by 0069".
- **The code points to its reasons.** A comment like `(docs/0086)` leads straight to why the code behaves as it does. This is the log's biggest payoff for maintenance.
- **Choices made without the owner are marked.** 0082–0084 say they were proposed by Claude and then reviewed choice by choice.

## 3. What makes it hard

### 3.1 Old records don't point to newer ones

The log's rule is that an accepted record is never edited. Only its status line changes, and only when the whole record is superseded. So when a later record *refines* an older one, or replaces part of it, the older one stays silent.

**63 records have been refined, amended or partly superseded by a later record. In 50 of them, neither the record nor its index row names every later record that changed it.** Some examples:

| Record | Later records that changed it | What the old record and its index row show |
|---|---|---|
| 0015, floor-plan versioning | 0080, 0081, 0082 | "Accepted" |
| 0034, v1 data model | 0078, 0082, 0083 | "Accepted". It names one later change, 0086, in an "Amended by" line. |
| 0017, people data synced from AD via Keycloak | 0084 (CSV and Excel import instead, for v1) | "Accepted" |
| 0027, v1 interim access | 0080, 0084, 0088 | "Accepted" |
| 0089, floor editor | 0090, 0092 | "Accepted". Its index row names 0094 and 0095. |

A reader who opens 0017 learns that people come from AD. That isn't true in 1.0, and nothing in 0017 says so.

**Partial replacements are better handled.** Of 7 `Supersedes` lines, 4 replace only part of an older record (0053, 0064, 0065, 0043). The index notes all four. The records themselves don't, so someone arriving through a link from the code still gets the old rule.

### 3.2 Topics are spread over chains of records

Some areas have been decided step by step, and today's rule is the sum of a chain:

- **Plan versioning:** 0015 → 0028 → 0080 → 0081 → 0082 → 0089
- **Releases and deployment:** 0054 → 0056 → 0087 → 0097 → 0099 → 0102 → 0104 → 0107
- **Branching and merging:** 0064 → 0069 → 0079 → 0093 → 0104
- **The org tree:** 0006 → 0017 → 0019 → 0024 → 0084

None of these is wrong. But no single page states the current rules for releases, for example.

### 3.3 Code references that have drifted

- `backend/src/hsp/models/org.py:74` cites **0023**, which was superseded by 0084. The index it guards (one primary team per person) is 0084's rule.
- `deploy/bin/hsp` and `backup/src/hsp_backup/cli.py` cite **0109**, which doesn't exist yet. It is due with the second part of the #112 review fixes.

Nothing checks these references. A typo or a superseded number goes unnoticed.

### 3.4 Status lines vary

Most status lines say "Accepted". Five carry long free text instead, such as "Accepted. Proposed by Claude while the product owner was away, then reviewed…". This is useful information, but it makes the status hard to scan or check with a script.

## 4. Recommendations

**1. A generated "Changed by" column in the index.** A small script reads the `Refines`, `Supersedes` and `Amends` lines of every record and fills in a column of the index (`docs/decisions/README.md`). CI fails if the column is out of date, as it already does for the OpenAPI file. This gives every record a forward pointer without editing any accepted record, so the log's main rule stays as it is. This review found 50 missing forward pointers, and the script would fill all of them.

**2. A CI check on code references.** The same script lists every `docs/NNNN` in the code. It fails on a number that doesn't exist, and warns when the record is superseded.

**3. Later, "rules in force" pages per area.** For areas with long chains (3.2), a short page states today's rules and links to the records behind each one. It's the most readable option, but it is a second copy that must be kept current. We suggest waiting to see whether 1 and 2 are enough.

**Also, while at it:** move the review notes out of the five long status lines into a `- **Review:**` line, so every status is one of the four values the log's README allows. That is an edit to accepted records, though, so it would need its own small record, like the rename exception in [0072](../decisions/0072-2026-10-08-rename-hsm-to-hsp.md).

Each of these changes how the log is kept, so each would need a decision record of its own.
