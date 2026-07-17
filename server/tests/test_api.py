"""Test dell'API FastAPI end-to-end (upload → split-bar → poll → download)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient  # noqa: E402

from server import app as app_module  # noqa: E402
from server.tests.make_synthetic_prosthesis import (  # noqa: E402
    make_split_curve,
    make_synthetic_prosthesis,
)


@pytest.fixture(scope="module")
def client(tmp_path_factory: pytest.TempPathFactory):
    # Redirige la data dir su tmp per non sporcare /tmp/shen3d-cutter
    tmp = tmp_path_factory.mktemp("api-data")
    app_module.UPLOAD_DIR = tmp / "uploads"
    app_module.JOBS_DIR = tmp / "jobs"
    app_module.UPLOAD_DIR.mkdir(parents=True)
    app_module.JOBS_DIR.mkdir(parents=True)
    return TestClient(app_module.app)


@pytest.fixture(scope="module")
def synthetic_stl_bytes() -> bytes:
    mesh, _ = make_synthetic_prosthesis()
    return mesh.export(file_type="stl")


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["engines"]["trimesh"]


def test_upload_and_split_bar_e2e(client, synthetic_stl_bytes):
    up = client.post(
        "/api/upload",
        content=synthetic_stl_bytes,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert up.status_code == 200
    stl_path = up.json()["stl_path"]

    res = client.post("/api/split-bar", json={
        "stl_path": stl_path,
        "curve": make_split_curve(y_offset=-1.0),
        "insertion_axis": [0, 1, 0],
        "channels": [],
        "params": {"cement_gap_mm": 0.08},
    })
    assert res.status_code == 200
    job_id = res.json()["job_id"]

    # Poll fino a completamento (il subprocess impiega qualche secondo)
    deadline = time.time() + 300
    status = None
    while time.time() < deadline:
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["status"] in ("done", "error"):
            break
        time.sleep(0.5)

    assert status is not None
    assert status["status"] == "done", status
    assert status["result"]["bar"]["watertight"]
    assert status["result"]["superstructure"]["watertight"]

    # Download di entrambe le parti
    for part in ("bar", "superstructure"):
        filename = status["result"][part]["file"]
        dl = client.get(f"/api/download/{filename}")
        assert dl.status_code == 200
        assert len(dl.content) > 1000


def test_split_bar_validation(client):
    # Curva troppo corta → 422
    res = client.post("/api/split-bar", json={
        "stl_path": "/tmp/whatever.stl",
        "curve": [[0, 0, 0]] * 5,
        "insertion_axis": [0, 1, 0],
    })
    assert res.status_code == 422

    # Path fuori dalla upload dir → 422
    res = client.post("/api/split-bar", json={
        "stl_path": "/etc/passwd",
        "curve": [[float(i), 0.0, 0.0] for i in range(20)],
        "insertion_axis": [0, 1, 0],
    })
    assert res.status_code == 422


def test_job_not_found(client):
    res = client.get("/api/jobs/deadbeef1234")
    assert res.status_code == 404


def test_download_rejects_traversal(client):
    res = client.get("/api/download/..%2F..%2Fetc%2Fpasswd")
    assert res.status_code in (404, 422)
