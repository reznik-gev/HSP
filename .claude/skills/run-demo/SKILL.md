---
name: run-demo
description: Bring up the Northwind demo on a PR's code (or main), reseeded, so the owner can check it by hand. Reuse the running demo, switch its worktree to the PR, reseed, look at it in the browser pane and send the owner screenshots. Use when a draft needs the owner's eyes, or the owner says "set up the demo" or "show me #N".
---

# Run the demo for a PR

There is one demo, in `.claude/worktrees/demo` under the main checkout, on ports 8000 (API) and 5173 (app), with the `hsp_demo` database ([0136](../../../docs/decisions/0136-2026-11-10-the-demo-for-checking-prs.md)). It's the setup in [the demo guide](../../../docs/demos/northwind-robotics.md), made repeatable for checking PRs. Commands are PowerShell. Do these steps in order.

**Never** remove the demo worktree, commit in it, or stop its servers except to switch them in step 3.

A new tool call keeps no variables, so **start every PowerShell call with these two lines**:
```powershell
$main = (git worktree list --porcelain | Select-Object -First 1) -replace '^worktree ', ''
$demo = "$main\.claude\worktrees\demo"
```

## 1. What's running now?
```powershell
Get-NetTCPConnection -State Listen -LocalPort 8000,5173 -ErrorAction SilentlyContinue | ForEach-Object { "$($_.LocalPort): " + (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)").CommandLine }
git -C $demo log -1 --format='%h %s'
```
- If anything is on 8000 or 5173, **ask the owner before going on**: say what it shows (the folder, and the PR or commit). Don't start a second demo.
- If the demo already shows the PR's latest commit and both 8000 and 5173 are in use, skip to step 6. Go to step 5 first only if the owner wants fresh data. If it's on that commit but a server is down, go to step 3.

## 2. Get the PR's code
The first time, create the worktree: `git -C $main worktree add --detach $demo origin/main`. Then:
```powershell
git -C $demo fetch origin "pull/<N>/head"    # for main: git -C $demo fetch origin main
git -C $demo checkout --detach FETCH_HEAD
```
The checkout is detached, so the branch can stay checked out in the PR's own worktree.

## 3. Stop the old servers
Only after the owner said yes in step 1. This stops each server's whole process chain:
```powershell
foreach ($port in 8000,5173) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { continue }
  $id = $c.OwningProcess
  while (($p = Get-CimInstance Win32_Process -Filter "ProcessId=$id") -and
         ($q = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)") -and
         $q.CommandLine -match 'uvicorn|pnpm|vite') { $id = $q.ProcessId }
  taskkill /PID $id /T /F
}
```

## 4. Dependencies, database, servers
```powershell
docker compose -f "$main\deploy\compose.dev.yml" up -d
Push-Location "$demo\backend"; uv sync; Pop-Location
Push-Location "$demo\frontend"; corepack pnpm install --frozen-lockfile; Pop-Location
docker compose -f "$main\deploy\compose.dev.yml" exec -T postgres psql -U hsp -d hsp -c "DROP DATABASE IF EXISTS hsp_demo WITH (FORCE)" -c "CREATE DATABASE hsp_demo"
Push-Location "$demo\backend"; $env:HSP_DATABASE_URL = 'postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_demo'; uv run alembic upgrade head; Pop-Location
```
The dev stack runs from the main checkout's compose file, so other sessions' Postgres and Keycloak aren't recreated. The database is rebuilt here because the API won't start on a schema from another PR. Then start the servers in the background, so they outlive this session:
```powershell
$logs = "$env:LOCALAPPDATA\hsp-demo"; New-Item -ItemType Directory -Force $logs | Out-Null
Start-Process pwsh -WindowStyle Hidden -WorkingDirectory "$demo\backend" -RedirectStandardOutput "$logs\api.log" -RedirectStandardError "$logs\api.err.log" -ArgumentList '-NoProfile','-Command',"`$env:HSP_DATABASE_URL='postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_demo'; uv run uvicorn hsp.main:create_app --factory --port 8000"
Start-Process pwsh -WindowStyle Hidden -WorkingDirectory "$demo\frontend" -RedirectStandardOutput "$logs\app.log" -RedirectStandardError "$logs\app.err.log" -ArgumentList '-NoProfile','-Command','corepack pnpm dev'
```
Wait until `http://localhost:8000/readyz` says `ready` (Keycloak can take half a minute). If it doesn't, read `api.err.log`.

## 5. Reseed
```powershell
Push-Location "$demo\backend"; uv run python ../deploy/demo/seed.py; Pop-Location
```
It ends with `Ready: open http://localhost:5173 …`.

## 6. Check it in the browser pane
- Open <http://localhost:5173> and sign in as `dana.levin` / `demo` if asked.
- Go to what the PR changes, and try it.
- Look at it in **English and Hebrew** (the translate button, top right), and at a **narrow width** if the layout changed. Switch back to English when done.
- Screenshot what the owner will want to see.

## 7. Tell the owner
- What the demo shows now (PR and commit), and that it was reseeded.
- What to check, and where (the page, floor or desk), with the screenshots (`SendUserFile`).
- Sign-in: `dana.levin` (admin) or `sam.carter` (view only), password `demo`.
