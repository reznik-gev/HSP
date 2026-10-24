# Two flaky release tests

- **Date:** 2026-10-23 to 2026-10-24
- **Found on:** #107 (the backup service), whose release test failed now and then
- **Outcome:** two bugs, both already on `main` and unrelated to #107. Both are fixed in this PR.

## Summary
The release workflow builds the offline bundle, installs it on a clean runner, checks it, and runs the browser tests against it ([0102](../decisions/0102-2026-10-19-release-workflow.md)). On the v1 stack, about one run in five failed, in one of two ways:

1. **`/readyz` answered 503** right after the stack was healthy. Each API worker kept Keycloak's last answer for 10 s, a "still starting" one too. A worker that had asked while Keycloak was starting kept saying "not ready" after another worker had found it ready. **Fix:** keep only a ready answer ([0116](../decisions/0116-2026-10-24-readyz-remembers-only-ready.md)).
2. **The find-a-seat browser test** found a seat label's text reaching past its paper-coloured box by about a pixel. The box is measured once, at one zoom. Chrome hints text by default, which makes it a little wider at some zooms. **Fix:** draw labels without hinting (`text-rendering: geometricPrecision`), so text keeps its width at every zoom.

The bundle test now also prints `/readyz`'s answer when it fails, so a failure says which check wasn't ready.

## Was it #107?
The owner's first read was that #107 introduced or worsened the flakiness: it adds a fifth image and container, and changes the release workflow and the bundle test. That was the hypothesis to rule in or out first.

**Why it looked like #107.** All 28 failed release runs since 2026-10-21 were on the v1 stack, which #107 is the base of.

**Why that wasn't evidence.** The release workflow runs on a pull request only when it changes the release files (`.github/workflows/release.yml`, `deploy/bundle.sh`, `deploy/test-bundle.sh` and a few more). Before #107, it had run only 4 times, on one branch. #107 is the first PR in a while to change those files, and every PR above it inherits the change. So the failures could simply be the first time anyone ran the test often.

**The test.** We ran the release workflow by hand, as a dry run with no publish, on `main` at 244a1ff. That's #106 merged, with no backup image or container. We ran it 8 times at once, from 8 throwaway branches pointing at `main`, because runs on the same branch wait for each other. 3 of the 8 failed: 2 on the label test, 1 on the 503. So both failures happen without #107. We deleted the branches afterwards.

**What #107 does change.** Nothing that either bug depends on. It doesn't touch the API, the frontend or the readiness check. The 503 run on `main` had no backup container, and showed the same timing as the failures on #107 (below).

## Failure 1: `/readyz` answers 503
### Symptom
The bundle test starts the stack and waits until every container is healthy. Then it checks the app over HTTPS and asks the API's `/readyz`. That request failed with `urllib.error.HTTPError: HTTP Error 503: Service Unavailable`, under a second after "every service is healthy". The API's Docker health check *is* `/readyz` (it passed moments earlier, which is what made the API healthy), so the same endpoint answered 200, then 503.

### Evidence
The test script printed only the status, not the answer's body, which names the failing check. But the workflow prints the stack's logs after a failure, and Keycloak's log has what's needed.

For every 503 failure, we took four times from the job's log:
- when the API container started;
- when Keycloak turned away a request because it was still starting (`Request received during bootstrapping, returning a 503 error`);
- when Keycloak finished starting (`Bootstrap completed`);
- when the test's `/readyz` got its 503.

| Commit | API started | Keycloak said 503 | Keycloak ready | Test got 503 | Ready → test |
|---|---|---|---|---|---|
| 370ed4e | 49:26.5 | 49:32.1 | 49:42.6 | 49:47.5 | 4.9 s |
| a6d3926 | 30:06.8 | 30:12.4 | 30:23.4 | 30:33.3 | 9.9 s |
| a96fb41 | 21:36.4 | 21:47.9 | 21:56.4 | 22:03.3 | 6.9 s |
| 07f8c8f | 01:28.9 | 01:40.4 | 01:48.7 | 01:55.9 | 7.2 s |
| 3093f06 | 54:34.9 | 54:46.2 | 54:54.6 | 55:01.9 | 7.3 s |
| f8d9a63 | 47:56.8 | 48:08.1 | 48:16.2 | 48:23.8 | 7.6 s |
| 3ce720d | 26:20.3 | 26:31.7 | 26:40.1 | 26:47.3 | 7.2 s |
| 6385eea | 10:13.0 | 10:18.7 | 10:31.8 | 10:39.9 | 8.2 s |
| ad176a8 | 08:24.8 | 08:36.2 | 08:45.5 | 08:51.3 | 5.8 s |
| 926a6de | 27:21.6 | 27:32.8 | 27:41.2 | 27:47.9 | 6.6 s |
| 3e3a3ec | 26:12.8 | 26:24.1 | 26:35.4 | 26:45.3 | 9.9 s |
| `main` 244a1ff | 16:16.1 | 16:27.9 | 16:36.4 | 16:42.4 | 6.0 s |

Two things hold in every one:
- Keycloak was already ready when the test asked, and the database was up (migrations had run). Asking either of them afresh would have passed.
- The test asked **less than 10 s** after Keycloak became ready.

### Cause
`/readyz` asks Keycloak for its discovery document through `KeycloakProbe` (`backend/src/hsp/readiness.py`). The probe kept whatever Keycloak answered for 10 s, as [0105](../decisions/0105-2026-10-21-metrics-and-tracing.md) says, so frequent health checks don't load Keycloak. But the API runs 4 worker processes, and each has its own probe with its own memory. So:

1. Worker A answers a `/readyz` while Keycloak is still starting, and keeps "not ready" for 10 s.
2. Keycloak finishes starting.
3. Worker B answers the next Docker health check. It asks Keycloak, gets "ready", and the API turns healthy.
4. The test's request reaches worker A, which still says "not ready" from step 1.

That explains both facts above. A 503 is only possible while some worker holds a "not ready" from before Keycloak was ready, which means within 10 s of Keycloak becoming ready.

### Reproducing it
We ran the API's real `KeycloakProbe` class with a fake clock and a fake Keycloak that's ready from t = 5 s. Two probes stood for two workers:

```
t= 4.9s  worker A asked: Keycloak answered 503
t=10.0s  worker B asked: ready
t=11.0s  worker A asked: Keycloak answered 503     <- Keycloak has been ready since t=5s
t=15.0s  worker A asked: ready
```

A unit test now does the same with one probe (`test_keycloak_not_ready_is_asked_again_next_time`). It failed before the fix and passes after it.

### Fix
`KeycloakProbe` keeps only a **ready** answer for 10 s. After a not-ready answer, the next check asks Keycloak again. Recovery then shows on the next request, in every worker. While Keycloak is down, each `/readyz` call asks it, with the 2 s timeout. That's one request per health check, which Keycloak can take. Recorded as [0116](../decisions/0116-2026-10-24-readyz-remembers-only-ready.md), which refines 0105.

Other options we weighed:
- **Make the test retry `/readyz` for a few seconds.** It would hide a real bug that operators and their load balancers would also see.
- **Share the answer between workers,** in a file or the database. That's more machinery than the problem is worth.

## Failure 2: a seat label reaches past its box
### Symptom
`e2e/find-a-seat.spec.ts` opens a seat on the plan and checks that the label's paper-coloured box covers its text. The box was added so a monitor drawn under a label can't read as a strike-through. Now and then the text's right edge was past the box's:

| Where | Expected the box's right edge at least | Got |
|---|---|---|
| `main` (strict check) | > 545.21 | 544.64, 544.81 |
| #108 and above (1 px allowed) | ≥ 543.21 | 542.89 |
| | ≥ 546.21 | 546.17 |
| | ≥ 547.71 | 547.71 (0.005 short) |

#108 had already tried to fix this, by allowing a pixel ("Let the label-box check allow a pixel, as the eye does"). Its runs still failed, by up to 1.33 px. So the box really is narrower than the text sometimes, and the allowance only moved the line.

### Cause
`Label` in `frontend/src/editor/view-svg/PlanView.tsx` measures its text once with `getBBox()`, in plan millimetres, and draws the box 40 mm larger on each side. It measures again only when the label changes or the web font finishes loading. The plan then zooms, by changing the SVG's `viewBox`, and nothing is measured again. That's fine only if the text's width, in millimetres, is the same at every zoom.

It isn't, with Chrome's default text drawing (`text-rendering: auto`). Chrome hints the font for the size it will appear on screen. Glyph widths get rounded to whole pixels, so the same text is a little wider, in millimetres, when it's drawn smaller.

### Reproducing it
We measured one SVG label, styled like the plan's (Inter, weight 500, 180 mm), in Playwright's Chromium, at different `viewBox` widths:

| How it's drawn | Text width in mm, from close to far |
|---|---|
| `auto` (default) | 869.87 → 869.92 → 882.42 → 897.04 → 967.35 |
| `geometricPrecision` | 869.86 at every zoom |

Then the real case. We measured the box at one zoom and showed the label at another, for every pair of zooms where labels are visible (0.5–30 mm per pixel; beyond that, labels are hidden). We did that for 34 label texts, and recorded how far the text reached past its box at worst:

| Browser | `auto` | `geometricPrecision` |
|---|---|---|
| Chromium on Windows | covered, with 0.32 px to spare | covered, with 1.33 px to spare |
| Chromium on Linux (Playwright 1.64.0's image, as in CI) | **1.83 px past the box** (measured at 25 mm/px, shown at 30) | covered, with 1.33 px to spare |

Linux reproduces CI's misses, of up to 1.33 px. Windows doesn't, which is why the test never failed on a Windows machine. Its font hinting differs.

### Fix
Labels are drawn with `text-rendering: geometricPrecision`, so their width doesn't change with zoom and one measurement fits at every zoom. At 30 mm per pixel the box still has 1.33 px to spare on each side, which is its 40 mm of padding. That's enough for `main`'s strict check, so #108's one-pixel allowance isn't needed once this is merged.

Other options we weighed:
- **Measure the label again whenever the zoom changes.** Every label would update on every scroll of the wheel, against the plan view's design of not drawing plan elements again while panning and zooming.
- **More padding.** It only moves the line: Linux missed by 1.83 px with today's 40 mm.

Unhinted text can look a touch softer at small sizes. Labels sit on a halo and a box, so it should hardly show, but nobody has compared them by eye yet.

## Verification
- **Unit tests:** the backend's suite passes (202 passed). 75 tests need a database and were skipped locally; CI runs them. The frontend's lint, format check, type check and tests pass.
- **The release workflow:** 12 dry runs of this branch at once, from 12 throwaway branches, as for `main` above. All 12 passed. On `main`, 3 of 8 failed. If the fixes changed nothing, 12 passes in a row would happen about once in 280 tries (5/8 to the 12th power). We deleted the branches afterwards.

## How we went about it
- **Looked at every failure, not one.** We listed all 28 failed release runs since 2026-10-21, and took each one's failing line from the logs. Two failure types came up again and again.
- **Lined up the logs by time.** The stack's logs, printed after a failure, put Keycloak's startup and the test's request on one timeline.
- **Checked the first theory against those times,** and dropped it (under "What went wrong along the way").
- **Ran `main` itself,** to separate "#107 causes it" from "#107 runs the test that shows it".
- **Reproduced both causes outside CI:** the probe in Python with the API's own code, and the label in a real browser on the same platform as CI.
- **Wrote the failing test before the fix,** for the probe.

## What went wrong along the way
- **A first theory that didn't fit the times.** We first guessed that Docker's own health checks left a stale "not ready" behind. But they come 10 s apart, exactly as long as an answer was kept, so any answer they left had run out by the next check. The Keycloak log showed the real timing.
- **The first label experiment didn't use the right font.** A page loaded with Playwright's `setContent` can't fetch a `file://` font, and `document.fonts.ready` resolves anyway. So the first numbers were for a fallback system font. We caught it when an explicit `document.fonts.load()` failed, then wrote the page to a file and loaded it from there.
- **Windows didn't reproduce the label miss,** until we ran the same experiment in Playwright's Linux image.
- **Passing runs don't print the stack's logs,** so we couldn't measure the Keycloak-ready-to-test gap in runs that passed. The 10 s pattern is shown for the failures only.
- **The bundle test printed no reason for the 503.** It printed only the status. It prints the answer's body now.
- **Reading job logs with `gh api`** needs `--allow-escape-sequences`, because the logs contain colour codes. Without it, `gh` printed nothing useful.

## What's left
- Once this is merged, #108's one-pixel allowance can go back to the strict check, or stay. It's harmless either way.
- The release workflow still runs only when the release files change. A bug like these can sit unseen on `main` until a PR happens to touch them. A scheduled dry run would catch them sooner. That's a separate decision.
