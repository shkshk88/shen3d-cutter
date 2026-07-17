"""Test della pipeline S1–S3 su protesi sintetica."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from server.blender_ops.common import build_split_solid, load_and_validate_stl  # noqa: E402
from server.blender_ops.split_bar import run_pipeline  # noqa: E402
from server.tests.make_synthetic_prosthesis import (  # noqa: E402
    make_split_curve,
    make_synthetic_prosthesis,
)

PIPELINE_SCRIPT = Path(__file__).resolve().parents[1] / "blender_ops" / "split_bar.py"


@pytest.fixture(scope="module")
def synthetic(tmp_path_factory: pytest.TempPathFactory):
    tmp = tmp_path_factory.mktemp("synthetic")
    mesh, channels = make_synthetic_prosthesis()
    stl_path = tmp / "prosthesis.stl"
    mesh.export(stl_path)
    return {"mesh": mesh, "channels": channels, "stl_path": stl_path, "tmp": tmp}


def test_synthetic_is_watertight(synthetic):
    assert synthetic["mesh"].is_watertight
    assert synthetic["mesh"].volume > 0


def test_load_and_validate(synthetic):
    mesh = load_and_validate_stl(str(synthetic["stl_path"]))
    assert mesh.is_watertight
    assert abs(mesh.volume - synthetic["mesh"].volume) / synthetic["mesh"].volume < 0.01


def test_build_split_solid_watertight():
    curve = np.asarray(make_split_curve(y_offset=-1.0), dtype=np.float64)
    solid = build_split_solid(curve, np.array([0.0, 1.0, 0.0]), length=100.0)
    assert solid.is_watertight
    assert solid.volume > 0


def test_pipeline_s1_s3(synthetic):
    out_dir = synthetic["tmp"] / "job_direct"
    job = {
        "job_id": "test01",
        "out_dir": str(out_dir),
        "stl_path": str(synthetic["stl_path"]),
        "curve": make_split_curve(y_offset=-1.0),
        "insertion_axis": [0.0, 1.0, 0.0],
        "channels": synthetic["channels"],
        "params": {},
    }
    report = run_pipeline(job)

    assert report["result"]["bar"]["watertight"]
    assert report["result"]["superstructure"]["watertight"]
    assert report["result"]["checks"]["volume_conservation"]

    bar = trimesh.load(out_dir / report["result"]["bar"]["file"])
    sup = trimesh.load(out_dir / report["result"]["superstructure"]["file"])
    original = synthetic["mesh"]

    # Le due parti insieme ricostruiscono (quasi) il volume originale:
    # lo split S3 è una partizione esatta, senza gap
    total = bar.volume + sup.volume
    assert abs(total - original.volume) / original.volume < 0.01

    # La barra sta sotto la curva (y <= -1 + tolleranza catmull), la
    # sovrastruttura sopra
    assert bar.bounds[1][1] <= -1.0 + 0.5
    assert sup.bounds[0][1] >= -1.0 - 0.5


def test_pipeline_subprocess_success(synthetic):
    """End-to-end come lo esegue il runner: subprocess + report.json."""
    out_dir = synthetic["tmp"] / "job_subprocess"
    out_dir.mkdir()
    job = {
        "job_id": "test02",
        "out_dir": str(out_dir),
        "stl_path": str(synthetic["stl_path"]),
        "curve": make_split_curve(y_offset=-1.0),
        "insertion_axis": [0.0, 1.0, 0.0],
        "channels": synthetic["channels"],
        "params": {},
    }
    job_file = out_dir / "job.json"
    job_file.write_text(json.dumps(job))

    proc = subprocess.run(
        [sys.executable, str(PIPELINE_SCRIPT), "--job", str(job_file)],
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    report = json.loads((out_dir / "report.json").read_text())
    assert report["status"] == "done"
    assert (out_dir / report["result"]["bar"]["file"]).exists()
    assert (out_dir / report["result"]["superstructure"]["file"]).exists()


def test_pipeline_error_reports_stage(synthetic, tmp_path):
    """STL rotto → report con failed_stage=S1, exit code 1."""
    bad_stl = tmp_path / "bad.stl"
    bad_stl.write_bytes(b"solid nothing\nendsolid nothing\n")
    out_dir = tmp_path / "job_bad"
    job = {
        "job_id": "test03",
        "out_dir": str(out_dir),
        "stl_path": str(bad_stl),
        "curve": make_split_curve(y_offset=-1.0),
        "insertion_axis": [0.0, 1.0, 0.0],
        "channels": [],
        "params": {},
    }
    job_file = tmp_path / "job.json"
    job_file.write_text(json.dumps(job))

    proc = subprocess.run(
        [sys.executable, str(PIPELINE_SCRIPT), "--job", str(job_file)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 1
    report = json.loads((out_dir / "report.json").read_text())
    assert report["status"] == "error"
    assert report["failed_stage"] == "S1"
