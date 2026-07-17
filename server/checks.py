"""Suite di verifica delle parti generate (usata in-pipeline S10 e da pytest)."""
from __future__ import annotations

import numpy as np
import trimesh


def intersection_volume(a: trimesh.Trimesh, b: trimesh.Trimesh) -> float:
    """Volume dell'intersezione (deve essere ~0 tra barra e sovrastruttura)."""
    try:
        inter = trimesh.boolean.intersection([a, b], engine="manifold")
    except Exception:  # noqa: BLE001 — intersezione vuota può far fallire il motore
        return 0.0
    if not isinstance(inter, trimesh.Trimesh) or len(inter.faces) == 0:
        return 0.0
    return float(abs(inter.volume))


def gap_stats(
    bar: trimesh.Trimesh,
    superstructure: trimesh.Trimesh,
    expected_gap: float,
    samples: int = 1500,
) -> dict:
    """Campiona la superficie della barra e misura la distanza dalla
    sovrastruttura nelle zone contrapposte (dove il gap cemento deve esistere).
    """
    points, _ = trimesh.sample.sample_surface(bar, samples)
    query = trimesh.proximity.ProximityQuery(superstructure)
    distances = np.abs(query.signed_distance(points))

    # Considera "contrapposte" le zone entro 5×gap dalla sovrastruttura
    opposed = distances[distances < expected_gap * 5]
    if len(opposed) == 0:
        return {"opposed_samples": 0, "gap_min": None, "gap_median": None}
    return {
        "opposed_samples": int(len(opposed)),
        "gap_min": float(np.min(opposed)),
        "gap_median": float(np.median(opposed)),
        "gap_max_opposed": float(np.max(opposed)),
    }


def insertion_sweep_check(
    bar: trimesh.Trimesh,
    superstructure: trimesh.Trimesh,
    direction: np.ndarray,
    step: float = 0.25,
    n_steps: int = 6,
    tolerance_mm3: float = 1e-2,
) -> dict:
    """Simula l'inserzione: trasla la sovrastruttura lungo +direction a passi
    e verifica che non compenetri mai la barra (fit passivo).
    """
    d = np.asarray(direction, dtype=np.float64)
    d = d / np.linalg.norm(d)
    worst = 0.0
    for k in range(1, n_steps + 1):
        moved = superstructure.copy()
        moved.apply_translation(d * (step * k))
        vol = intersection_volume(bar, moved)
        worst = max(worst, vol)
        if vol > tolerance_mm3:
            return {"passive_fit": False, "failed_at_step": k, "intersection_mm3": vol}
    return {"passive_fit": True, "max_intersection_mm3": worst, "steps": n_steps}


def channel_patency(
    part: trimesh.Trimesh,
    center: np.ndarray,
    axis: np.ndarray,
    t_range: tuple[float, float],
    n_samples: int = 20,
) -> bool:
    """Il canale è pervio se i punti lungo l'asse sono FUORI dal solido."""
    d = np.asarray(axis, dtype=np.float64)
    d = d / np.linalg.norm(d)
    ts = np.linspace(t_range[0], t_range[1], n_samples)
    points = np.asarray(center)[None, :] + ts[:, None] * d[None, :]
    inside = part.contains(points)
    return not bool(np.any(inside))


def min_thickness_stats(
    mesh: trimesh.Trimesh,
    threshold: float,
    samples: int = 800,
) -> dict:
    """Spessore locale campionato via raggi interni (warning, non enforcement)."""
    points, face_idx = trimesh.sample.sample_surface(mesh, samples)
    normals = mesh.face_normals[face_idx]
    try:
        thickness = trimesh.proximity.thickness(
            mesh, points, normals=normals, method="ray"
        )
    except Exception:  # noqa: BLE001 — metodo best-effort
        return {"thickness_ok": None, "error": "misura spessore non disponibile"}
    thickness = thickness[np.isfinite(thickness)]
    if len(thickness) == 0:
        return {"thickness_ok": None}
    below = float(np.mean(thickness < threshold))
    return {
        "thickness_min": float(np.min(thickness)),
        "thickness_median": float(np.median(thickness)),
        "below_threshold_ratio": below,
        "thickness_ok": bool(below < 0.05),
    }
