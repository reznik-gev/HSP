"""Write the OpenAPI schema to backend/openapi.json (docs/0035, docs/0039).

CI runs this and fails if the committed file differs.
"""

import json
import sys
from pathlib import Path

from hsm.main import create_app


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
    schema = create_app().openapi()
    # newline="\n" keeps LF on Windows too (docs/0026).
    out.write_text(
        json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
