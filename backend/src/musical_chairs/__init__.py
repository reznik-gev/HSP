"""Musical Chairs API service."""

import os

#: The product version (docs/0063). Release images set MUSICAL_CHAIRS_VERSION from the git tag
#: (docs/0097).
__version__ = os.environ.get("MUSICAL_CHAIRS_VERSION") or "0.0.0-dev"
