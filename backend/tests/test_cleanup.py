import os
import time

from datalens_ai.api.analyse import _RESULTS_DIR, results_store
from datalens_ai.api.cleanup import sweep_expired
from datalens_ai.api.upload import _UPLOAD_DIR, file_store


def test_sweep_removes_old_files_keeps_recent_and_evicts_cache():
    old = _UPLOAD_DIR / "stale-id.csv"
    old.write_text("a,b\n1,2\n")
    recent = _UPLOAD_DIR / "fresh-id.csv"
    recent.write_text("a,b\n3,4\n")
    old_result = _RESULTS_DIR / "stale-id.json"
    old_result.write_text("{}")

    # Caches reference the files we're about to age out.
    file_store["stale-id"] = str(old)
    results_store["stale-id"] = {"results": {}, "summary": "x"}

    # Backdate the stale files well past the 24h retention window.
    past = time.time() - 48 * 3600
    os.utime(old, (past, past))
    os.utime(old_result, (past, past))

    removed = sweep_expired()

    assert removed >= 2
    assert not old.exists()
    assert not old_result.exists()
    assert recent.exists()  # within retention — untouched
    assert "stale-id" not in file_store  # cache evicted in step with disk
    assert "stale-id" not in results_store

    recent.unlink()
