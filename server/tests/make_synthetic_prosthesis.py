"""Genera una protesi ibrida sintetica con ground truth noto per i test.

Arcata semplificata: toro parziale (ferro di cavallo) spesso, con N camini
vite verticali passanti. Non è anatomica ma esercita la pipeline con la
stessa topologia di una vera ibrida: solido watertight + tubi cavi interni.
"""
from __future__ import annotations

import numpy as np
import trimesh


def make_synthetic_prosthesis(
    arch_radius: float = 22.0,
    body_radius: float = 6.0,
    n_channels: int = 4,
    channel_radius: float = 1.4,
    arc_degrees: float = 180.0,
) -> tuple[trimesh.Trimesh, list[dict]]:
    """Ritorna (mesh, canali ground-truth).

    L'arcata giace nel piano XZ, l'asse dei camini è Y (occlusale = +Y).
    """
    # Corpo: toro completo nel piano XZ, poi tagliato a ferro di cavallo.
    # trimesh.creation.torus giace nel piano XY: ruota di 90° attorno a X.
    body = trimesh.creation.torus(
        major_radius=arch_radius,
        minor_radius=body_radius,
        major_sections=96,
        minor_sections=32,
    )
    body.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))

    if arc_degrees < 360.0:
        # Mantieni l'arco [0, arc_degrees] (misurato da +X verso +Z):
        # sottrai un cuneo. Per 180° basta un semispazio z < 0.
        span = arch_radius + body_radius * 2
        cutter = trimesh.creation.box(extents=[span * 2, body_radius * 4, span])
        cutter.apply_translation([0, 0, -span / 2])
        body = trimesh.boolean.difference([body, cutter], engine="manifold")

    body.merge_vertices()
    if not body.is_watertight:
        trimesh.repair.fill_holes(body)
    assert body.is_watertight, "corpo sintetico non watertight"

    # Camini: cilindri verticali passanti, sottratti al corpo
    channels: list[dict] = []
    cutters: list[trimesh.Trimesh] = []
    angles = np.radians(np.linspace(15, arc_degrees - 15, n_channels))
    height = body_radius * 4
    for a in angles:
        center = np.array([arch_radius * np.cos(a), 0.0, arch_radius * np.sin(a)])
        cutter = trimesh.creation.cylinder(radius=channel_radius, height=height, sections=48)
        # cylinder è lungo Z: ruota per allinearlo a Y
        cutter.apply_transform(
            trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])
        )
        cutter.apply_translation(center)
        cutters.append(cutter)
        channels.append({
            "center": center.tolist(),
            "axis": [0.0, 1.0, 0.0],
            "radius": channel_radius,
            "top": (center + np.array([0, body_radius, 0])).tolist(),
            "bottom": (center - np.array([0, body_radius, 0])).tolist(),
        })

    result = trimesh.boolean.difference([body, *cutters], engine="manifold")
    assert isinstance(result, trimesh.Trimesh) and result.is_watertight
    return result, channels


def make_split_curve(
    arch_radius: float = 22.0,
    body_radius: float = 6.0,
    arc_degrees: float = 180.0,
    y_offset: float = 0.0,
    n_points: int = 64,
) -> list[list[float]]:
    """Curva chiusa attorno al corpo dell'arcata a quota y_offset.

    Segue il bordo esterno e interno dell'arcata (silhouette del toro
    parziale sul piano y=y_offset).
    """
    # Raggio della sezione alla quota y_offset
    if abs(y_offset) >= body_radius:
        raise ValueError("y_offset fuori dal corpo")
    r_sec = float(np.sqrt(body_radius**2 - y_offset**2))

    arc = np.radians(np.linspace(0, arc_degrees, n_points // 2))
    outer = [
        [float((arch_radius + r_sec) * np.cos(a)), float(y_offset), float((arch_radius + r_sec) * np.sin(a))]
        for a in arc
    ]
    inner = [
        [float((arch_radius - r_sec) * np.cos(a)), float(y_offset), float((arch_radius - r_sec) * np.sin(a))]
        for a in reversed(arc)
    ]
    return outer + inner


if __name__ == "__main__":
    mesh, chans = make_synthetic_prosthesis()
    mesh.export("/tmp/synthetic_prosthesis.stl")
    print(f"exported /tmp/synthetic_prosthesis.stl — {len(mesh.faces)} facce, {len(chans)} canali")
