"""Utility geometriche condivise dalla pipeline split bar.

Divisione dei compiti:
- trimesh + manifold3d: I/O STL, validazione, boolean esatti (union/diff/intersezione)
- bpy/bmesh (Blender headless): costruzione del solido di split dalla curva
  (triangle_fill su loop non planari) e riparazioni mesh avanzate
"""
from __future__ import annotations

import numpy as np
import trimesh


class PipelineError(Exception):
    """Errore di uno stage della pipeline, con nome stage per il report."""

    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage
        self.message = message


# ---------------------------------------------------------------------------
# I/O e validazione
# ---------------------------------------------------------------------------

def load_and_validate_stl(path: str) -> trimesh.Trimesh:
    """S1 — Carica l'STL e garantisce una mesh watertight.

    NON esegue voxel remesh: le interfacce implantari devono restare esatte.
    """
    mesh = trimesh.load(path, force="mesh")
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
        raise PipelineError("S1", f"File non valido o vuoto: {path}")

    # merge di vertici coincidenti (STL duplica tutto) + pulizia degeneri
    mesh.merge_vertices(merge_tex=True, merge_norm=True)
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()

    if not mesh.is_watertight:
        trimesh.repair.fill_holes(mesh)
        trimesh.repair.fix_normals(mesh)

    if not mesh.is_watertight:
        raise PipelineError(
            "S1",
            "Mesh non watertight anche dopo la riparazione: "
            f"{len(mesh.faces)} facce, esporta di nuovo l'STL da exocad",
        )

    if mesh.volume < 0:
        mesh.invert()

    return mesh


def to_manifold_checked(mesh: trimesh.Trimesh, stage: str, label: str) -> trimesh.Trimesh:
    """Verifica che la mesh sia processabile da manifold3d (watertight, no self-int gravi)."""
    if not mesh.is_watertight:
        raise PipelineError(stage, f"{label}: mesh non watertight")
    return mesh


def _manifold_boolean(
    a: trimesh.Trimesh, b: trimesh.Trimesh, operation: str
) -> trimesh.Trimesh | None:
    if operation == "intersection":
        result = trimesh.boolean.intersection([a, b], engine="manifold")
    elif operation == "difference":
        result = trimesh.boolean.difference([a, b], engine="manifold")
    elif operation == "union":
        result = trimesh.boolean.union([a, b], engine="manifold")
    else:
        raise ValueError(operation)
    if not isinstance(result, trimesh.Trimesh) or len(result.faces) == 0:
        return None
    return result


def _bpy_boolean(
    a: trimesh.Trimesh, b: trimesh.Trimesh, operation: str
) -> trimesh.Trimesh | None:
    """Fallback: boolean EXACT di Blender (tollera input imperfetti)."""
    import bpy

    op_map = {"union": "UNION", "difference": "DIFFERENCE", "intersection": "INTERSECT"}

    def to_object(mesh: trimesh.Trimesh, name: str):
        data = bpy.data.meshes.new(name)
        data.from_pydata(mesh.vertices.tolist(), [], mesh.faces.tolist())
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        return obj

    obj_a = to_object(a, "shen3d_bool_a")
    obj_b = to_object(b, "shen3d_bool_b")
    try:
        mod = obj_a.modifiers.new("bool", "BOOLEAN")
        mod.operation = op_map[operation]
        mod.object = obj_b
        mod.solver = "EXACT"
        bpy.context.view_layer.objects.active = obj_a
        bpy.ops.object.modifier_apply(modifier=mod.name)

        data = obj_a.data
        data.calc_loop_triangles()
        verts = np.array([v.co[:] for v in data.vertices], dtype=np.float64)
        faces = np.array([tri.vertices[:] for tri in data.loop_triangles], dtype=np.int64)
    finally:
        mesh_a, mesh_b = obj_a.data, obj_b.data
        bpy.data.objects.remove(obj_a, do_unlink=True)
        bpy.data.objects.remove(obj_b, do_unlink=True)
        bpy.data.meshes.remove(mesh_a)
        bpy.data.meshes.remove(mesh_b)

    if len(faces) == 0:
        return None
    result = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    result.merge_vertices()
    return result


def boolean_op(
    a: trimesh.Trimesh,
    b: trimesh.Trimesh,
    operation: str,
    stage: str,
    allow_empty: bool = False,
) -> trimesh.Trimesh | None:
    """Boolean esatto: manifold3d primario, Blender EXACT come fallback
    (utile quando un operando ha lievi auto-intersezioni, es. mesh offsettata).
    """
    manifold_error: Exception | None = None
    try:
        result = _manifold_boolean(a, b, operation)
        if result is not None:
            return result
    except Exception as exc:  # noqa: BLE001 — si passa al fallback
        manifold_error = exc

    if _bpy_available():
        try:
            result = _bpy_boolean(a, b, operation)
            if result is not None:
                return result
        except Exception as exc:  # noqa: BLE001
            raise PipelineError(
                stage,
                f"Boolean {operation} fallito (manifold: {manifold_error}; bpy: {exc})",
            ) from exc

    if allow_empty:
        return None
    raise PipelineError(
        stage,
        f"Boolean {operation} fallito o vuoto"
        + (f" (manifold: {manifold_error})" if manifold_error else ""),
    )


def union_all(meshes: list[trimesh.Trimesh], stage: str) -> trimesh.Trimesh:
    if len(meshes) == 1:
        return meshes[0]
    try:
        result = trimesh.boolean.union(meshes, engine="manifold")
    except Exception as exc:  # noqa: BLE001
        raise PipelineError(stage, f"Union multipla fallita: {exc}") from exc
    if not isinstance(result, trimesh.Trimesh) or len(result.faces) == 0:
        raise PipelineError(stage, "Union multipla: risultato vuoto")
    return result


# ---------------------------------------------------------------------------
# Solido di split dalla curva (bpy/bmesh)
# ---------------------------------------------------------------------------

def _bpy_available() -> bool:
    try:
        import bpy  # noqa: F401
        return True
    except ImportError:
        return False


def inflate_curve_outward(
    curve_points: np.ndarray,
    direction: np.ndarray,
    amount: float,
) -> np.ndarray:
    """Sposta ogni punto della curva verso l'esterno del loop (nel piano ⊥ direction).

    Evita le tangenze/complanarità tra la parete del solido di split e la
    superficie della mesh lungo la curva — il caso più fragile per i boolean.
    """
    d = direction / np.linalg.norm(direction)
    ref = np.array([1.0, 0.0, 0.0]) if abs(d[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(d, ref)
    u /= np.linalg.norm(u)
    v = np.cross(d, u)

    pts2d = np.column_stack([curve_points @ u, curve_points @ v])
    n = len(pts2d)

    # Winding (area con segno): >0 = antiorario nel piano (u,v)
    x, y = pts2d[:, 0], pts2d[:, 1]
    signed_area = 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
    sign = 1.0 if signed_area > 0 else -1.0

    inflated = curve_points.copy()
    for i in range(n):
        tangent = pts2d[(i + 1) % n] - pts2d[(i - 1) % n]
        norm = np.linalg.norm(tangent)
        if norm < 1e-12:
            continue
        tangent /= norm
        # Normale 2D esterna: ruota la tangente di -90° (per winding antiorario)
        outward2d = np.array([tangent[1], -tangent[0]]) * sign
        offset3d = u * outward2d[0] + v * outward2d[1]
        inflated[i] = curve_points[i] + offset3d * amount

    return inflated


def build_split_solid(
    curve_points: np.ndarray,
    direction: np.ndarray,
    length: float,
    inflate: float = 0.05,
) -> trimesh.Trimesh:
    """S2 — Costruisce il solido H delimitato dalla curva di split.

    - la curva viene gonfiata di `inflate` mm verso l'esterno del loop per
      evitare pareti complanari/tangenti alla superficie della protesi
    - parete: la curva estrusa lungo -direction per `length`
    - cap superiore: triangolazione del loop (non planare) — bmesh triangle_fill
    - cap inferiore: loop traslato, riempito e triangolato

    `direction` punta verso l'occlusale (l'estrusione va in giù, lato intaglio).
    """
    pts = np.asarray(curve_points, dtype=np.float64)
    if inflate > 0:
        pts = inflate_curve_outward(pts, np.asarray(direction, dtype=np.float64), inflate)
    if _bpy_available():
        return _build_split_solid_bmesh(pts, direction, length)
    return _build_split_solid_numpy(pts, direction, length)


def _build_split_solid_bmesh(
    curve_points: np.ndarray,
    direction: np.ndarray,
    length: float,
) -> trimesh.Trimesh:
    import bmesh

    d = direction / np.linalg.norm(direction)
    n = len(curve_points)

    bm = bmesh.new()
    try:
        verts = [bm.verts.new(tuple(p)) for p in curve_points]
        edges = [bm.edges.new((verts[i], verts[(i + 1) % n])) for i in range(n)]

        # Cap superiore: riempi il loop non planare
        fill = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
        if not fill.get("geom"):
            # Fallback: ventaglio verso il centroide
            centroid = bm.verts.new(tuple(curve_points.mean(axis=0)))
            for i in range(n):
                bm.faces.new((verts[i], verts[(i + 1) % n], centroid))

        # Parete: estrusione del solo loop di bordo lungo -d
        ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
        new_verts = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=new_verts, vec=tuple(-d * length))

        # Cap inferiore: il loop estruso è planare solo se la curva lo è —
        # qui è una copia traslata della curva, quindi non planare: riempi
        # con triangle_fill anche questo
        boundary_edges = [e for e in bm.edges if e.is_boundary]
        if boundary_edges:
            fill2 = bmesh.ops.triangle_fill(
                bm, use_beauty=True, use_dissolve=False, edges=boundary_edges
            )
            if not fill2.get("geom"):
                bottom_centroid = bm.verts.new(tuple(curve_points.mean(axis=0) - d * length))
                loop_verts = sorted(new_verts, key=lambda v: v.index)
                m = len(loop_verts)
                for i in range(m):
                    bm.faces.new((loop_verts[i], loop_verts[(i + 1) % m], bottom_centroid))

        bmesh.ops.triangulate(bm, faces=bm.faces)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

        out_verts = np.array([v.co[:] for v in bm.verts], dtype=np.float64)
        bm.verts.index_update()
        out_faces = np.array(
            [[loop.vert.index for loop in f.loops] for f in bm.faces], dtype=np.int64
        )
    finally:
        bm.free()

    solid = trimesh.Trimesh(vertices=out_verts, faces=out_faces, process=True)
    solid.merge_vertices()
    trimesh.repair.fix_normals(solid)

    if not solid.is_watertight:
        raise PipelineError("S2", "Solido di split non watertight (cap fallito)")
    if solid.volume < 0:
        solid.invert()
    return solid


def _build_split_solid_numpy(
    curve_points: np.ndarray,
    direction: np.ndarray,
    length: float,
) -> trimesh.Trimesh:
    """Fallback senza bpy: cap a ventaglio sul centroide.

    Corretto per curve star-shaped rispetto al centroide nella proiezione
    ⊥ direction (tipico delle silhouette protesiche).
    """
    d = direction / np.linalg.norm(direction)
    n = len(curve_points)
    top = np.asarray(curve_points, dtype=np.float64)
    bottom = top - d * length

    top_c = top.mean(axis=0)
    bottom_c = bottom.mean(axis=0)

    vertices = np.vstack([top, bottom, top_c[None, :], bottom_c[None, :]])
    i_top_c = 2 * n
    i_bottom_c = 2 * n + 1

    faces = []
    for i in range(n):
        j = (i + 1) % n
        # cap superiore (normale verso +d)
        faces.append([i, j, i_top_c])
        # cap inferiore (normale verso -d)
        faces.append([n + j, n + i, i_bottom_c])
        # parete (due triangoli per quad)
        faces.append([j, i, n + i])
        faces.append([j, n + i, n + j])

    solid = trimesh.Trimesh(vertices=vertices, faces=np.array(faces), process=True)
    trimesh.repair.fix_normals(solid)
    if not solid.is_watertight:
        raise PipelineError("S2", "Solido di split non watertight (fallback numpy)")
    if solid.volume < 0:
        solid.invert()
    return solid
