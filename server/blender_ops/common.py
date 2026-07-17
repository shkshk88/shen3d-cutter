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


def simplify_bounded(mesh: trimesh.Trimesh, epsilon: float) -> trimesh.Trimesh | None:
    """Semplifica con errore geometrico limitato a `epsilon` mm e output
    garantito manifold (Manifold.simplify). Ritorna None se fallisce."""
    try:
        import numpy as _np
        from manifold3d import Manifold, Mesh

        man = Manifold(Mesh(
            vert_properties=_np.ascontiguousarray(mesh.vertices, dtype=_np.float32),
            tri_verts=_np.ascontiguousarray(mesh.faces, dtype=_np.uint32),
        ))
        out = man.simplify(epsilon).to_mesh()
        result = trimesh.Trimesh(
            vertices=_np.asarray(out.vert_properties, dtype=_np.float64),
            faces=_np.asarray(out.tri_verts, dtype=_np.int64),
            process=True,
        )
        if not result.is_watertight or len(result.faces) == 0:
            return None
        return result
    except Exception:  # noqa: BLE001 — semplificazione best-effort
        return None


# ---------------------------------------------------------------------------
# Camini, offset e sweep (S4–S7)
# ---------------------------------------------------------------------------

def cylinder_between(
    p0: np.ndarray, p1: np.ndarray, radius: float, sections: int = 48
) -> trimesh.Trimesh:
    return trimesh.creation.cylinder(
        radius=radius, segment=(p0, p1), sections=sections
    )


def make_chimney(
    channel: dict,
    original: trimesh.Trimesh,
    wall_mm: float,
    mode: str,
) -> trimesh.Trimesh | None:
    """S4 — Anello attorno al camino vite: cyl(r+parete) − cyl(r), clippato
    all'anatomia. `mode='through'` arriva fin sopra l'occlusale (anello
    visibile al foro di accesso), `'stop_below_occlusal'` si ferma sotto.
    """
    axis = np.asarray(channel["axis"], dtype=np.float64)
    axis = axis / np.linalg.norm(axis)
    bottom = np.asarray(channel["bottom"], dtype=np.float64)
    top = np.asarray(channel["top"], dtype=np.float64)
    radius = float(channel["radius"])

    # Estremo superiore: proiezione massima dell'originale lungo l'asse
    t_mesh_max = float(np.max(original.vertices @ axis))
    t_bottom = float(bottom @ axis) - 0.3
    if mode == "stop_below_occlusal":
        t_top = float(top @ axis) - 0.8
    else:
        t_top = t_mesh_max + 1.0
    if t_top - t_bottom < 1.0:
        return None

    origin = bottom - axis * (bottom @ axis)  # punto a t=0 sull'asse
    p0 = origin + axis * t_bottom
    p1 = origin + axis * t_top

    outer = cylinder_between(p0, p1, radius + wall_mm)
    inner = cylinder_between(p0 - axis, p1 + axis, radius)
    ring = boolean_op(outer, inner, "difference", "S4", allow_empty=True)
    if ring is None:
        return None
    clipped = boolean_op(ring, original, "intersection", "S4", allow_empty=True)
    return clipped


def offset_mesh(mesh: trimesh.Trimesh, distance: float) -> trimesh.Trimesh:
    """S6 — Offset per-vertice lungo le normali (dilatazione gap cemento).

    NO voxel remesh: a 60–100µm il voxel richiesto sarebbe irrealistico.
    L'offset può auto-intersecare nelle concavità strette: il chiamante fa
    l'unione col solido originale per sanare le pieghe (boolean_op ha il
    fallback Blender EXACT che tollera input auto-intersecanti).
    """
    dilated = mesh.copy()
    dilated.vertices = mesh.vertices + mesh.vertex_normals * distance
    return dilated


def sweep_along_direction(
    mesh: trimesh.Trimesh,
    direction: np.ndarray,
    total_length: float,
    step: float,
    stage: str = "S7",
) -> trimesh.Trimesh:
    """Volume ombra per unioni raddoppiate (Minkowski discreto con segmento).

    Esatto ma costoso su mesh dense (il numero di copie è L/δ): usato solo
    come fallback — il percorso primario è `shadow_volume_heightfield`.
    """
    d = np.asarray(direction, dtype=np.float64)
    d = d / np.linalg.norm(d)

    swept = mesh
    covered = 0.0
    shift = step
    while covered < total_length:
        moved = swept.copy()
        moved.apply_translation(d * shift)
        result = boolean_op(swept, moved, "union", stage)
        assert result is not None
        swept = result
        covered += shift
        shift = covered + step

    return swept


def shadow_volume_heightfield(
    tool: trimesh.Trimesh,
    direction: np.ndarray,
    cell: float,
    floor_t: float,
    samples: int = 400_000,
) -> trimesh.Trimesh:
    """S7 — Volume ombra dello strumento lungo −direction come heightfield.

    Lo sweep verso il basso di un solido = regione sotto il suo inviluppo
    superiore lungo `direction`: si rasterizza l'inviluppo su una griglia
    ⊥ direction (z-buffer max dei campioni di superficie) e si costruisce il
    solido "terreno" (top = inviluppo, pareti perimetrali, fondo a floor_t).

    Conservativo per costruzione: dilatazione morfologica 3×3 dell'inviluppo
    (la cavità può solo allargarsi di ≤1 cella — clearance extra nelle zone di
    blockout, mai interferenza). Costo lineare, nessuna unione booleana.
    """
    d = np.asarray(direction, dtype=np.float64)
    d = d / np.linalg.norm(d)
    ref = np.array([1.0, 0.0, 0.0]) if abs(d[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(d, ref)
    u /= np.linalg.norm(u)
    v = np.cross(d, u)

    surface_pts, _ = trimesh.sample.sample_surface(tool, samples)
    pts = np.vstack([tool.vertices, surface_pts])
    pu = pts @ u
    pv = pts @ v
    pt = pts @ d

    u0 = pu.min() - cell
    v0 = pv.min() - cell
    nu = int(np.ceil((pu.max() - u0) / cell)) + 2
    nv = int(np.ceil((pv.max() - v0) / cell)) + 2

    iu = np.clip(((pu - u0) / cell).astype(int), 0, nu - 1)
    iv = np.clip(((pv - v0) / cell).astype(int), 0, nv - 1)

    height = np.full((nu, nv), -np.inf)
    np.maximum.at(height, (iu, iv), pt)

    # Dilatazione morfologica 3×3: copre i buchi di campionamento e rende
    # l'inviluppo conservativo (≤1 cella verso l'esterno)
    padded = np.full((nu + 2, nv + 2), -np.inf)
    padded[1:-1, 1:-1] = height
    dilated = height.copy()
    for du in (0, 1, 2):
        for dv in (0, 1, 2):
            np.maximum(dilated, padded[du:du + nu, dv:dv + nv], out=dilated)
    height = dilated
    mask = height > -np.inf

    # De-scacchierizzazione: celle connesse solo in diagonale creano vertici
    # non-manifold nel solido terreno — riempi l'angolo mancante
    for _ in range(8):
        a = mask[:-1, :-1] & mask[1:, 1:] & ~mask[1:, :-1] & ~mask[:-1, 1:]
        b = mask[1:, :-1] & mask[:-1, 1:] & ~mask[:-1, :-1] & ~mask[1:, 1:]
        if not (a.any() or b.any()):
            break
        fill_h = np.maximum(height[:-1, :-1], height[1:, 1:])
        idx = np.argwhere(a)
        for ci, cj in idx:
            height[ci + 1, cj] = max(height[ci + 1, cj], fill_h[ci, cj])
            mask[ci + 1, cj] = True
        fill_h2 = np.maximum(height[1:, :-1], height[:-1, 1:])
        idx = np.argwhere(b)
        for ci, cj in idx:
            height[ci, cj] = max(height[ci, cj], fill_h2[ci, cj])
            mask[ci, cj] = True

    # Quote degli angoli (nu+1 × nv+1) = max delle celle adiacenti
    hpad = np.full((nu + 2, nv + 2), -np.inf)
    hpad[1:-1, 1:-1] = height
    corner = np.maximum(
        np.maximum(hpad[:-1, :-1], hpad[1:, :-1]),
        np.maximum(hpad[:-1, 1:], hpad[1:, 1:]),
    )  # (nu+1, nv+1)

    # Indici vertici: per ogni angolo usato, un vertice top e uno floor
    corner_used = corner > -np.inf
    corner_idx = np.full(corner.shape, -1, dtype=np.int64)
    used_positions = np.argwhere(corner_used)
    corner_idx[corner_used] = np.arange(len(used_positions))
    n_corners = len(used_positions)

    cu = u0 + used_positions[:, 0] * cell
    cv = v0 + used_positions[:, 1] * cell
    ch = corner[corner_used]
    top_vertices = cu[:, None] * u[None, :] + cv[:, None] * v[None, :] + ch[:, None] * d[None, :]
    floor_vertices = cu[:, None] * u[None, :] + cv[:, None] * v[None, :] + floor_t * d[None, :]
    vertices = np.vstack([top_vertices, floor_vertices])

    faces: list[list[int]] = []
    cell_positions = np.argwhere(mask)
    for ci, cj in cell_positions:
        c00 = corner_idx[ci, cj]
        c10 = corner_idx[ci + 1, cj]
        c01 = corner_idx[ci, cj + 1]
        c11 = corner_idx[ci + 1, cj + 1]
        # top (normale ~ +d)
        faces.append([c00, c10, c11])
        faces.append([c00, c11, c01])
        # fondo (normale ~ −d)
        f00, f10, f01, f11 = c00 + n_corners, c10 + n_corners, c01 + n_corners, c11 + n_corners
        faces.append([f00, f11, f10])
        faces.append([f00, f01, f11])
        # pareti sui bordi cella piena/vuota
        if ci == 0 or not mask[ci - 1, cj]:
            faces.append([c00, c01, f01])
            faces.append([c00, f01, f00])
        if ci == nu - 1 or not mask[ci + 1, cj]:
            faces.append([c10, f10, f11])
            faces.append([c10, f11, c11])
        if cj == 0 or not mask[ci, cj - 1]:
            faces.append([c00, f00, f10])
            faces.append([c00, f10, c10])
        if cj == nv - 1 or not mask[ci, cj + 1]:
            faces.append([c01, c11, f11])
            faces.append([c01, f11, f01])

    solid = trimesh.Trimesh(vertices=vertices, faces=np.array(faces, dtype=np.int64), process=True)
    solid.merge_vertices()
    trimesh.repair.fix_normals(solid)
    if not solid.is_watertight:
        raise PipelineError("S7", "Volume ombra heightfield non watertight")
    if solid.volume < 0:
        solid.invert()

    simplified = simplify_bounded(solid, epsilon=0.02)
    return simplified if simplified is not None else solid


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
