"""Periodic disk hygiene for the temp files DataLens leaves behind.

Uploaded CSVs and persisted result JSONs are written to the system temp dir and
were never deleted, so they accumulated for the lifetime of the container. This
sweep removes anything older than the configured retention window and keeps the
in-memory caches in step with what's actually on disk.
"""

import asyncio
import time

from datalens_ai.api.analyse import _RESULTS_DIR, results_store
from datalens_ai.api.upload import _UPLOAD_DIR, file_store
from datalens_ai.config import settings

CLEANUP_INTERVAL_SECONDS = 3600  # sweep hourly


def sweep_expired(now: float | None = None) -> int:
    """Delete upload + result files older than the retention window.

    Returns the number of files removed. Best-effort: never raises, so a single
    unremovable file can't take down the background loop.
    """
    if now is None:
        now = time.time()
    max_age = settings.file_retention_hours * 3600
    removed = 0
    for directory, cache in ((_UPLOAD_DIR, file_store), (_RESULTS_DIR, results_store)):
        for path in directory.glob("*"):
            try:
                if path.is_file() and now - path.stat().st_mtime > max_age:
                    path.unlink()
                    cache.pop(path.stem, None)  # file_id == filename stem
                    removed += 1
            except OSError:
                pass
    return removed


async def cleanup_loop() -> None:
    """Sweep once on startup, then on a fixed interval, until cancelled."""
    while True:
        sweep_expired()
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
