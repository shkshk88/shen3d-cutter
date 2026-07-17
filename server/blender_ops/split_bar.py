"""Pipeline split bar — eseguita in un subprocess per job (crash isolation).

Fase 9: stage S1–S3 (import/validazione, solido H dalla curva, split grezzo).
Gli stage S4–S10 (camini, gap cemento, blockout, report esteso) arrivano in Fase 10.

Uso: python -m server.blender_ops.split_bar --job /path/job.json
job.json: {stl_path, curve, insertion_axis, channels, params, out_dir, job_id}
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import trimesh

if __package__ in (None, ""):
    # Eseguito come script: rendi importabile il package server/
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from server.blender_ops.common import (
        PipelineError,
        boolean_op,
        build_split_solid,
        load_and_validate_stl,
    )
else:
    from .common import (
        PipelineError,
        boolean_op,
        build_split_solid,
        load_and_validate_stl,
    )


def mesh_stats(mesh: trimesh.Trimesh) -> dict:
    return {
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(mesh.faces)),
        "volume": float(mesh.volume),
        "watertight": bool(mesh.is_watertight),
    }


def run_pipeline(job: dict) -> dict:
    out_dir = Path(job["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    job_id = job["job_id"]

    report: dict = {"job_id": job_id, "stages": {}, "engine": {}}
    try:
        import bpy  # noqa: F401
        report["engine"]["bpy"] = bpy.app.version_string
    except ImportError:
        report["engine"]["bpy"] = None
    report["engine"]["trimesh"] = trimesh.__version__

    curve = np.asarray(job["curve"], dtype=np.float64)
    axis = np.asarray(job["insertion_axis"], dtype=np.float64)
    axis = axis / np.linalg.norm(axis)

    # --- S1: import + validazione -----------------------------------------
    t0 = time.time()
    original = load_and_validate_stl(job["stl_path"])
    report["stages"]["S1"] = {
        "seconds": round(time.time() - t0, 2),
        "original": mesh_stats(original),
    }

    # --- S2: solido di split H dalla curva --------------------------------
    t0 = time.time()
    diagonal = float(np.linalg.norm(original.bounds[1] - original.bounds[0]))
    solid = build_split_solid(curve, axis, length=diagonal * 2)
    report["stages"]["S2"] = {
        "seconds": round(time.time() - t0, 2),
        "split_solid": mesh_stats(solid),
    }

    # --- S3: split grezzo ---------------------------------------------------
    # bar_base = tutto ciò che sta sotto/dentro la curva (lato intaglio)
    # super_raw = il resto (lato occlusale) — in Fase 10 sarà sostituito
    # dal calcolo con gap cemento + blockout (S6–S8)
    t0 = time.time()
    bar_base = boolean_op(original, solid, "intersection", "S3")
    super_raw = boolean_op(original, solid, "difference", "S3")
    report["stages"]["S3"] = {
        "seconds": round(time.time() - t0, 2),
        "bar_base": mesh_stats(bar_base),
        "super_raw": mesh_stats(super_raw),
    }

    # --- Export -------------------------------------------------------------
    bar_file = f"bar_{job_id}.stl"
    super_file = f"super_{job_id}.stl"
    bar_base.export(out_dir / bar_file)
    super_raw.export(out_dir / super_file)

    vol_original = float(original.volume)
    report["result"] = {
        "bar": {"file": bar_file, **mesh_stats(bar_base)},
        "superstructure": {"file": super_file, **mesh_stats(super_raw)},
        "checks": {
            "volume_conservation": bool(
                bar_base.volume + super_raw.volume <= vol_original * 1.001
            ),
            "volume_original": vol_original,
        },
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True, help="Percorso del file job.json")
    args = parser.parse_args()

    job_path = Path(args.job)
    job = json.loads(job_path.read_text())
    out_dir = Path(job["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "report.json"

    try:
        report = run_pipeline(job)
        report["status"] = "done"
        report_path.write_text(json.dumps(report, indent=2))
        return 0
    except PipelineError as exc:
        report_path.write_text(json.dumps({
            "status": "error",
            "failed_stage": exc.stage,
            "error": exc.message,
        }, indent=2))
        return 1
    except Exception as exc:  # noqa: BLE001 — il report deve sempre esistere
        report_path.write_text(json.dumps({
            "status": "error",
            "failed_stage": "unknown",
            "error": f"{type(exc).__name__}: {exc}",
        }, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
