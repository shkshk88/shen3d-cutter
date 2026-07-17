"""Pipeline split bar — eseguita in un subprocess per job (crash isolation).

Stage S1–S10: import/validazione → solido H dalla curva → barra base (∩) →
camini anulari → barra B (∪) → dilatazione gap cemento → volume ombra lungo
l'asse di inserzione (blockout + clearance + fori accesso in un'unica
operazione) → sovrastruttura S = originale − ombra → ri-foratura difensiva
canali su S → export + report con suite di verifica.

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

from server.blender_ops.common import (  # noqa: E402
    PipelineError,
    boolean_op,
    build_split_solid,
    cylinder_between,
    load_and_validate_stl,
    make_chimney,
    offset_mesh,
    sweep_along_direction,
)
from server import checks  # noqa: E402

DEFAULT_PARAMS = {
    "cement_gap_mm": 0.08,
    "channel_wall_mm": 0.5,
    "bar_min_thickness_mm": 2.0,
    "blockout_step_mm": 0.2,
    "chimney_mode": "through",
}


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
    params = {**DEFAULT_PARAMS, **(job.get("params") or {})}
    channels: list[dict] = job.get("channels") or []

    report: dict = {"job_id": job_id, "stages": {}, "engine": {}, "warnings": []}
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

    # Auto-orientazione dell'asse: l'occlusale (sovrastruttura, il grosso del
    # volume) deve stare sopra la quota della curva lungo +asse
    curve_t = float(np.mean(curve @ axis))
    com_t = float(original.center_mass @ axis)
    if com_t < curve_t:
        axis = -axis
        report["warnings"].append("Asse di inserzione ribaltato automaticamente")

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

    # --- S3: barra base = originale ∩ H ------------------------------------
    t0 = time.time()
    bar_base = boolean_op(original, solid, "intersection", "S3")
    assert bar_base is not None
    report["stages"]["S3"] = {
        "seconds": round(time.time() - t0, 2),
        "bar_base": mesh_stats(bar_base),
    }

    # --- S4: camini anulari -------------------------------------------------
    t0 = time.time()
    chimneys: list[trimesh.Trimesh] = []
    for i, channel in enumerate(channels):
        ring = make_chimney(channel, original, params["channel_wall_mm"], params["chimney_mode"])
        if ring is None or len(ring.faces) == 0:
            report["warnings"].append(f"Camino {i + 1}: anello vuoto, saltato")
            continue
        chimneys.append(ring)
    report["stages"]["S4"] = {
        "seconds": round(time.time() - t0, 2),
        "chimneys": len(chimneys),
    }

    # --- S5: barra B = base ∪ camini + check spessore -----------------------
    t0 = time.time()
    bar = bar_base
    for ring in chimneys:
        merged = boolean_op(bar, ring, "union", "S5", allow_empty=True)
        if merged is not None:
            bar = merged
    thickness = checks.min_thickness_stats(bar, params["bar_min_thickness_mm"])
    if thickness.get("thickness_ok") is False:
        report["warnings"].append(
            f"Spessore barra sotto {params['bar_min_thickness_mm']}mm in "
            f"{thickness['below_threshold_ratio'] * 100:.0f}% dei campioni"
        )
    report["stages"]["S5"] = {
        "seconds": round(time.time() - t0, 2),
        "bar": mesh_stats(bar),
        "thickness": thickness,
    }

    # --- S6: dilatazione gap cemento ---------------------------------------
    t0 = time.time()
    gap = params["cement_gap_mm"]
    dilated = offset_mesh(bar, gap)
    # L'unione con la barra sana le pieghe dell'offset nelle concavità
    bar_gap = boolean_op(dilated, bar, "union", "S6")
    assert bar_gap is not None
    report["stages"]["S6"] = {
        "seconds": round(time.time() - t0, 2),
        "bar_gap": mesh_stats(bar_gap),
    }

    # --- S7: volume ombra lungo −asse (direzione di calzata) ----------------
    # La sovrastruttura scende lungo −asse per calzare sulla barra: un suo
    # punto p collide se p + s·asse ∈ B per qualche s>0, cioè se p appartiene
    # allo sweep della barra dilatata verso il BASSO. Questo scava in un colpo
    # solo: impronta con gap, blockout dei sottosquadri e clearance del
    # percorso di inserzione (i camini 'through' arrivano all'occlusale e la
    # loro ombra apre i fori di accesso).
    t0 = time.time()
    t_mesh_min = float(np.min(original.vertices @ axis))
    t_bar_max = float(np.max(bar_gap.vertices @ axis))
    sweep_length = (t_bar_max - t_mesh_min) + 2.0
    shadow = sweep_along_direction(bar_gap, -axis, sweep_length, params["blockout_step_mm"])
    report["stages"]["S7"] = {
        "seconds": round(time.time() - t0, 2),
        "shadow": mesh_stats(shadow),
        "sweep_length_mm": round(sweep_length, 1),
    }

    # --- S8: sovrastruttura S = originale − ombra ---------------------------
    t0 = time.time()
    superstructure = boolean_op(original, shadow, "difference", "S8")
    assert superstructure is not None
    # Tieni solo il componente maggiore (schegge da scallop dello sweep)
    parts = superstructure.split(only_watertight=False)
    if len(parts) > 1:
        volumes = [abs(p.volume) if p.is_watertight else 0.0 for p in parts]
        superstructure = parts[int(np.argmax(volumes))]
        report["warnings"].append(
            f"Sovrastruttura: rimossi {len(parts) - 1} frammenti minori"
        )
    report["stages"]["S8"] = {
        "seconds": round(time.time() - t0, 2),
        "superstructure": mesh_stats(superstructure),
    }

    # --- S9: ri-foratura difensiva dei canali sulla sovrastruttura ----------
    t0 = time.time()
    for channel in channels:
        ch_axis = np.asarray(channel["axis"], dtype=np.float64)
        ch_axis = ch_axis / np.linalg.norm(ch_axis)
        bottom = np.asarray(channel["bottom"], dtype=np.float64)
        radius = float(channel["radius"])
        t_bot = float(bottom @ ch_axis) + 0.2  # mai dentro la sede vite
        t_top = float(np.max(original.vertices @ ch_axis)) + 2.0
        origin = bottom - ch_axis * (bottom @ ch_axis)
        drill = cylinder_between(origin + ch_axis * t_bot, origin + ch_axis * t_top, radius)
        redrilled = boolean_op(superstructure, drill, "difference", "S9", allow_empty=True)
        if redrilled is not None and len(redrilled.faces) > 0:
            superstructure = redrilled
    report["stages"]["S9"] = {"seconds": round(time.time() - t0, 2)}

    # --- S10: verifica + export ---------------------------------------------
    t0 = time.time()
    inter_vol = checks.intersection_volume(bar, superstructure)
    gap_report = checks.gap_stats(bar, superstructure, gap)
    sweep_check = checks.insertion_sweep_check(bar, superstructure, axis)
    patency = []
    for channel in channels:
        ch_axis = np.asarray(channel["axis"], dtype=np.float64)
        ch_axis = ch_axis / np.linalg.norm(ch_axis)
        bottom = np.asarray(channel["bottom"], dtype=np.float64)
        t_bot = float(bottom @ ch_axis)
        t_top = float(np.asarray(channel["top"], dtype=np.float64) @ ch_axis)
        origin = bottom - ch_axis * t_bot
        patency.append(checks.channel_patency(
            superstructure, origin, ch_axis, (t_bot + 0.5, t_top - 0.5)
        ))

    vol_original = float(original.volume)
    result_checks = {
        "parts_intersection_mm3": inter_vol,
        "no_interpenetration": bool(inter_vol < 1e-2),
        "gap": gap_report,
        "insertion": sweep_check,
        "channels_patent": patency,
        "volume_conservation": bool(
            bar.volume + superstructure.volume <= vol_original * 1.001
        ),
        "volume_original": vol_original,
    }
    report["stages"]["S10"] = {"seconds": round(time.time() - t0, 2)}

    bar_file = f"bar_{job_id}.stl"
    super_file = f"super_{job_id}.stl"
    bar.export(out_dir / bar_file)
    superstructure.export(out_dir / super_file)

    report["result"] = {
        "bar": {"file": bar_file, **mesh_stats(bar)},
        "superstructure": {"file": super_file, **mesh_stats(superstructure)},
        "checks": result_checks,
        "params": params,
        "warnings": report["warnings"],
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
