"""Run the Northwind demo on a PR's code, for checking it by hand (0136).

There is one demo: the worktree `.claude/worktrees/demo` under the main checkout, the API on port
8000, the app on 5173 and the `hsp_demo` database. Run it from backend/, like the seed:

    uv run python ../deploy/demo/demo.py status
    uv run python ../deploy/demo/demo.py switch --pr 157     # or --main
    uv run python ../deploy/demo/demo.py stop

`switch` checks out the commit (detached), stops the servers this script started, installs the
dependencies, rebuilds `hsp_demo`, starts both servers in the background, waits for the API and
reseeds (deploy/demo/seed.py). Nothing here asks for confirmation: the run-demo skill asks the
owner before a switch. Only the standard library is used, so it runs on Windows, macOS and Linux.
"""

import argparse
import contextlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn

DATABASE_URL = "postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_demo"  # As in seed.py.
PORTS = {"api": 8000, "app": 5173}
READY = "http://localhost:8000/readyz"
WINDOWS = sys.platform == "win32"


def environment(extra: dict[str, str] | None = None) -> dict[str, str]:
    """This process's environment without its virtualenv, which belongs to another checkout."""
    return {**{k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}, **(extra or {})}


def fail(message: str) -> NoReturn:
    sys.exit(f"demo: {message}")


def run(*args: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> str:
    """Run a command and return its output, or stop with what it printed."""
    exe = shutil.which(args[0]) or fail(f"{args[0]} isn't on the PATH")
    result = subprocess.run(
        [exe, *args[1:]],
        cwd=cwd,
        env=environment(env),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode:
        fail(f"`{' '.join(args)}` failed:\n{result.stdout}{result.stderr}".rstrip())
    return result.stdout.strip()


def step(message: str) -> None:
    print(f"== {message}", flush=True)


# --- Where things are ------------------------------------------------------------------------


def main_checkout() -> Path:
    first = run("git", "worktree", "list", "--porcelain").splitlines()[0]
    return Path(first.removeprefix("worktree "))


def demo_worktree() -> Path:
    return main_checkout() / ".claude" / "worktrees" / "demo"


def state_dir(demo: Path) -> Path:
    """The demo worktree's own git folder: it keeps the servers' ids and logs out of the tree."""
    return Path(run("git", "-C", str(demo), "rev-parse", "--absolute-git-dir")) / "hsp-demo"


def in_use(port: int) -> bool:
    """Whether anything answers on the port, over IPv4 or IPv6 (Vite may listen on either)."""
    try:
        socket.create_connection(("localhost", port), timeout=0.5).close()
    except OSError:
        return False
    return True


def compose(*args: str) -> str:
    """The dev stack, always from the main checkout's file, so it's never recreated elsewhere."""
    return run(
        "docker", "compose", "-f", str(main_checkout() / "deploy" / "compose.dev.yml"), *args
    )


# --- Servers ---------------------------------------------------------------------------------


def start(name: str, args: list[str], cwd: Path, logs: Path, env: dict[str, str]) -> int:
    """Start a server that outlives this script and the session that ran it."""
    exe = shutil.which(args[0]) or fail(f"{args[0]} isn't on the PATH")
    log = (logs / f"{name}.log").open("w")
    # A new process group (Windows) or session (elsewhere), so it can be stopped as a whole.
    flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(
        subprocess, "CREATE_NO_WINDOW", 0
    )
    process = subprocess.Popen(
        [exe, *args[1:]],
        cwd=cwd,
        env=environment(env),
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        creationflags=flags if WINDOWS else 0,
        start_new_session=not WINDOWS,
    )
    return process.pid


def kill_tree(pid: int) -> None:
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False)
    else:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(pid, signal.SIGTERM)


def stop(demo: Path) -> None:
    """Stop the servers this script started. Anything else on the ports is left alone."""
    saved = state_dir(demo) / "servers.json"
    if saved.exists():
        for name, pid in json.loads(saved.read_text()).items():
            # After a reboot or a crash the id may belong to another process by now: kill it
            # only while its port is still in use.
            if in_use(PORTS[name]):
                print(f"   stopping the {name} (process {pid})")
                kill_tree(pid)
        saved.unlink()
    for _ in range(20):
        if not any(in_use(p) for p in PORTS.values()):
            return
        time.sleep(0.5)
    busy = ", ".join(str(p) for p in PORTS.values() if in_use(p))
    fail(
        f"port {busy} is in use by something this script didn't start. "
        "Stop it yourself, then run this again."
    )


# --- Commands --------------------------------------------------------------------------------


def status(_: argparse.Namespace) -> None:
    demo = demo_worktree()
    if not demo.exists():
        print(f"no demo worktree at {demo}")
    else:
        print(f"worktree: {demo}")
        print(f"commit:   {run('git', '-C', str(demo), 'log', '-1', '--format=%h %s')}")
        saved = state_dir(demo) / "servers.json"
        print(f"started by this script: {saved.read_text().strip() if saved.exists() else 'none'}")
    for name, port in PORTS.items():
        print(f"{name} on {port}: {'up' if in_use(port) else 'down'}")


def switch(args: argparse.Namespace) -> None:
    main = main_checkout()
    demo = demo_worktree()

    step("The code")
    ref = "main" if args.main else f"pull/{args.pr}/head"
    if not demo.exists():
        run("git", "-C", str(main), "fetch", "origin", "main")
        run("git", "-C", str(main), "worktree", "add", "--detach", str(demo), "FETCH_HEAD")
    if run("git", "-C", str(demo), "status", "--porcelain", "--untracked-files=no"):
        fail(f"{demo} has local changes. Nobody should edit it; look before you discard them.")
    run("git", "-C", str(demo), "fetch", "origin", ref)

    step("Stopping the old servers")
    stop(demo)

    step("Checking out")
    run("git", "-C", str(demo), "checkout", "--detach", "FETCH_HEAD")
    print(f"   {run('git', '-C', str(demo), 'log', '-1', '--format=%h %s')}")

    step("Dependencies")
    run("uv", "sync", cwd=demo / "backend")
    run("corepack", "pnpm", "install", "--frozen-lockfile", cwd=demo / "frontend")

    step("A fresh hsp_demo database")
    compose("up", "-d", "--wait")
    # The API won't start on another PR's schema, so the seed's own rebuild runs first, here.
    run("uv", "run", "python", "../deploy/demo/seed.py", "--reset-only", cwd=demo / "backend")
    db = {"HSP_DATABASE_URL": DATABASE_URL}

    step("Starting the servers")
    logs = state_dir(demo)
    logs.mkdir(exist_ok=True)
    servers = {
        "api": start(
            "api",
            ["uv", "run", "uvicorn", "hsp.main:create_app", "--factory", "--port", "8000"],
            demo / "backend",
            logs,
            db,
        ),
        "app": start("app", ["corepack", "pnpm", "dev"], demo / "frontend", logs, {}),
    }
    (logs / "servers.json").write_text(json.dumps(servers))
    for _ in range(60):
        try:
            with urllib.request.urlopen(READY, timeout=2) as response:
                if b'"ready"' in response.read():
                    break
        except urllib.error.URLError, OSError:
            pass
        time.sleep(2)
    else:
        fail(f"the API isn't ready after two minutes. Its log: {logs / 'api.log'}")
    print(f"   up. Logs: {logs}")

    step("Reseeding Northwind Robotics")
    print(
        run("uv", "run", "python", "../deploy/demo/seed.py", cwd=demo / "backend").splitlines()[-1]
    )


def stop_command(_: argparse.Namespace) -> None:
    stop(demo_worktree())
    print("stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    commands = parser.add_subparsers(required=True)
    commands.add_parser("status", help="what the demo shows, and whether it's up").set_defaults(
        func=status
    )
    s = commands.add_parser("switch", help="show a PR's code (or main), reseeded")
    which = s.add_mutually_exclusive_group(required=True)
    which.add_argument("--pr", type=int, help="the PR's number")
    which.add_argument("--main", action="store_true", help="origin/main")
    s.set_defaults(func=switch)
    commands.add_parser("stop", help="stop the servers this script started").set_defaults(
        func=stop_command
    )
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
