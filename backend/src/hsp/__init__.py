"""HSP (Human-Space Program) API service."""

import os

#: The product version (docs/0063). Release images set HSP_VERSION from the git tag (docs/0097).
__version__ = os.environ.get("HSP_VERSION") or "0.0.0-dev"
