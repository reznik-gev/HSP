"""`hsp-api`: the image's entry point. Serves the metrics port, then runs the uvicorn workers
(docs/0097, docs/0105).

The metrics server runs in this, the parent process, so it outlives any one worker and reports
the sum of all of them (hsp/metrics.py).
"""

import os
import shutil
from pathlib import Path

import uvicorn
from prometheus_client import start_http_server

#: The API's port, published only to the container network (docs/0097).
API_PORT = 8000
#: The metrics port; Compose publishes it on HSP_METRICS_ADDRESS (docs/0105).
METRICS_PORT = 9464


def reset_metrics_dir(path: Path) -> None:
    """Empty the multiprocess folder, so a restart doesn't add up the last run's counts."""
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def main() -> None:
    metrics_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
    if metrics_dir:
        reset_metrics_dir(Path(metrics_dir))
        from hsp import metrics  # after the folder exists: the metrics write into it

        start_http_server(METRICS_PORT, registry=metrics.registry())
    uvicorn.run(
        "hsp.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=API_PORT,
        workers=int(os.environ.get("HSP_API_WORKERS", "4")),
        # Only hsp-web (or an ingress) reaches the API, so it may trust X-Forwarded-* from any
        # address on the container network: FORWARDED_ALLOW_IPS="*" in the image (docs/0097).
        proxy_headers=True,
        # The API logs each request itself (docs/0105).
        access_log=False,
    )
