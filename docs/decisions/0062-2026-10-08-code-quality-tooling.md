# 0062 — Code-quality tooling: Ruff + mypy, ESLint + Prettier

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Ruff + mypy / ESLint + Prettier** ✅
- Ruff + pyright / Biome
- Ruff + mypy / Biome

## Decision
**Python** (`backend/`, managed with `uv`):
- **Ruff** for linting and formatting. The rule set includes pyflakes, pycodestyle, isort, bugbear, pyupgrade, and `ASYNC` rules that catch blocking calls in async code ([0010](0010-2026-10-08-backend-stack.md)).
- **mypy `--strict`** with the Pydantic plugin. SQLAlchemy 2 typed mappings need no plugin.

**TypeScript** (`frontend/`):
- **ESLint** (flat config) with `typescript-eslint` (type-aware), `eslint-plugin-react-hooks` (catches dependency and re-render mistakes that matter for SVG performance, [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)) and an import-boundary rule: the **editor core must not import React, DOM or SVG modules**.
- **Prettier** for formatting. `tsc --noEmit` in strict mode.

**Common:**
- `.editorconfig` (LF per [0026](0026-2026-10-08-line-endings.md), UTF-8, final newline).
- `pre-commit` hooks run the fast checks locally. CI runs everything and is the gate.

## Consequences
- An established, well-documented toolchain.
- The renderer-agnostic boundary from 0052 is **enforced by lint**, not just by convention.
