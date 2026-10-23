# 0113 — Python command-line programs are built with typer

- **Date:** 2026-10-23
- **Status:** Accepted

## Context
`hsp-backup` ([0106](0106-2026-10-21-backups.md)) was first written with Python's own `argparse`: a parser built by hand, a table from command names to functions, and a `main()` that read the arguments and called the right one. Review of #106 asked for typer instead, and for a record, so the next Python command-line program starts the same way.

## Options considered
The owner asked for typer. The usual choices:

| Option | Chosen | Why |
|---|---|---|
| `argparse`, from the standard library | | No dependency, but each command is written twice: once as parser calls, once as the function that runs it. |
| click | | Widely used, but options are declared in decorators, apart from the function's own parameters. |
| **typer** | ✅ | Each command is a plain function, and its parameters and their types *are* its arguments and options. Help comes from the docstrings, and values are checked from the types (`--keep` must be a number of at least 1). It's by the author of FastAPI, which the API is built on ([0010](0010-2026-10-08-backend-stack.md)), so it reads the same way. Its test runner runs a command in-process, with its output and errors apart. |

## Decision
- A Python program that takes commands or options on the command line is built with **typer**. `hsp-backup` is the first.
- A program that only starts something and takes no arguments, like `hsp-api`, needs no parser.
- `hsp-export-openapi` reads its one argument from `sys.argv`. It moves to typer when it next changes.
- Commands are tested with typer's `CliRunner`.
- Shell scripts, such as `bin/hsp` ([0107](0107-2026-10-21-operator-cli.md)), are not affected.

## Consequences
- One more dependency in each program that uses it: typer, with rich, which formats the help.
- Expected failures are still said in one line, without a traceback, and the exit codes don't change: typer's `Exit` sets them.
