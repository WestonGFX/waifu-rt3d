"""Regression test for the DB connection FD accumulation bug.

Bug report: docs/bugs/2026-04-28-db-connection-fd-leak.md
Root cause: raw ``db()`` callsites in ``backend/server.py`` that did not
explicitly call ``conn.close()``.  Under uvicorn, FastAPI retains references
to handler locals past the HTTP response, so ``_AutoCloseConnection.__del__``
never fires — leaving one open FD per request.

Fix: migrate all callsites to ``with db_ctx() as conn: ...`` which guarantees
deterministic close on block exit.

This test fires 200 sequential GET requests against a simple, DB-reading
endpoint and asserts that the open-file-handle count to the ``.db`` file
grows by fewer than 50 between start and end (generous slop for transient
SQLite WAL/shm files and OS buffering).  Before the fix the count grew
~1 FD per request (200+ extra handles after 200 requests).

Skipped on Windows: ``psutil.Process.open_files()`` is unreliable on
Windows (requires elevated privileges and doesn't track SQLite's WAL/SHM
files).
"""

import os
import sys
import time
from pathlib import Path

import psutil
import pytest
from fastapi.testclient import TestClient


def _count_db_fds(proc: psutil.Process, db_path: Path) -> int:
    """Count open file descriptors pointing at *db_path* or its WAL/SHM siblings.

    Args:
        proc: The process to inspect.
        db_path: Path to the ``.db`` file (siblings ``*.db-wal`` and
            ``*.db-shm`` are automatically included).

    Returns:
        Number of open file handles that match the database paths.
    """
    target_stems = {
        str(db_path),
        str(db_path) + "-wal",
        str(db_path) + "-shm",
    }
    try:
        return sum(
            1
            for f in proc.open_files()
            if f.path in target_stems
        )
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        return 0


@pytest.mark.skipif(sys.platform == "win32", reason="open_files() unreliable on Windows")
def test_db_fd_count_stays_bounded_after_200_requests(client, db_path):
    """Fire 200 sequential GET /api/characters requests and assert FD count is bounded.

    Verifies that the ``db_ctx()`` migration successfully prevents FD
    accumulation.  Before the fix, each request to a raw-``db()`` handler
    left one unreleased FD.

    Args:
        client: FastAPI TestClient fixture (from conftest.py).
        db_path: Path to the test SQLite database (from conftest.py).
    """
    proc = psutil.Process(os.getpid())

    # Warm up: one request to let Python import caches settle.
    resp = client.get("/api/characters")
    assert resp.status_code == 200, f"Warmup request failed: {resp.status_code}"

    # Snapshot FD count AFTER warmup (SQLite WAL/SHM may appear on first access).
    # Small sleep to allow any pending GC/finalizers to run.
    time.sleep(0.05)
    fds_before = _count_db_fds(proc, db_path)

    n_requests = 200
    for _ in range(n_requests):
        resp = client.get("/api/characters")
        assert resp.status_code == 200

    # Allow any pending GC (should be unnecessary with db_ctx, but fair).
    time.sleep(0.05)
    fds_after = _count_db_fds(proc, db_path)

    delta = fds_after - fds_before
    # Pre-fix: delta ≈ n_requests (one FD leaked per request).
    # Post-fix: delta < 50 (generous slop for transient buffering).
    assert delta < 50, (
        f"FD leak detected: {fds_before} handles before → {fds_after} after "
        f"{n_requests} requests (delta={delta}).  Expected delta < 50.  "
        f"Check that all db() callsites use db_ctx()."
    )
