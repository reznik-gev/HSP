# Line widths

How long a line may be, in each kind of file ([0155](../decisions/0155-2026-11-22-line-widths.md)). Part of the [guides](README.md).

| Files | Width | Checked by |
|---|---|---|
| Python, in `backend/`, `backup/` and `deploy/demo/` | 120 characters, comments too ([0151](../decisions/0151-2026-11-21-python-lines-may-be-120-characters-long.md)). In `backend/migrations/versions/`, Ruff doesn't check line length (E501). | Ruff, in CI. Not `deploy/demo/`: format it by hand with `uv run ruff format --config pyproject.toml ../deploy/demo`, from `backend/` |
| TypeScript, CSS and JSON in `frontend/` | 100 characters, set by Prettier. Prettier doesn't wrap comments or strings. | `pnpm format:check`, in CI |
| Shell scripts and config files: `.sh`, `deploy/bin/musical-chairs`, `.yml`, Dockerfiles, `.env.example`, nginx files | **Comments wrap at 100 characters. Code lines aren't split to fit.** | Nothing: review |
| A commit's summary line | 100 characters ([0148](../decisions/0148-2026-11-18-every-commit-message-has-a-body.md)) | The `commit-msg` hook, and CI |
| Markdown | No width: a paragraph is one line | Nothing |

## When a comment goes over
A rename or another edit can push a comment in a script or config file past 100 characters. Rewrap the whole comment paragraph, not only the long line, so it reads as one piece. Keep code in backticks on one line.
