"""Which route answered a request, as its full template (docs/0105)."""

import re

from fastapi import Request

_PARAM = re.compile(r"{(\w+)(?::\w+)?}")


def route_template(request: Request) -> str | None:
    """The full template of the route that matched, e.g. /api/v1/floors/{floor_id}, or None if
    none did.

    FastAPI nests included routers, so the matched route's path lacks the prefixes it was
    included under (/api/v1). The rest of the real path is that route's path with its parameters
    filled in; whatever comes before it is the missing prefix.
    """
    route = request.scope.get("route")
    template: str | None = getattr(route, "path", None)
    if template is None:
        return None
    params = request.path_params
    filled = _PARAM.sub(lambda m: str(params.get(m.group(1), m.group(0))), template)
    path: str = request.scope["path"]
    if path.endswith(filled):
        return path[: len(path) - len(filled)] + template
    return template
