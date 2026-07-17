"""Shen3D Cutter API v2 — FastAPI + pipeline split bar in subprocess.

Avvio: python -m uvicorn server.app:app --port 8001
Sostituisce cutter_api.py (taglio planare, Fase 5).
"""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from .blender_runner import run_split_bar_job
from .jobs import JobStore

DATA_DIR = Path(os.environ.get("SHEN3D_DATA_DIR", "/tmp/shen3d-cutter"))
UPLOAD_DIR = DATA_DIR / "uploads"
JOBS_DIR = DATA_DIR / "jobs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Shen3D Cutter API", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs = JobStore(max_workers=1)


# ---------------------------------------------------------------------------
# Modelli
# ---------------------------------------------------------------------------

class ChannelIn(BaseModel):
    center: list[float] = Field(min_length=3, max_length=3)
    axis: list[float] = Field(min_length=3, max_length=3)
    radius: float = Field(gt=0.3, lt=5.0)
    top: list[float] = Field(min_length=3, max_length=3)
    bottom: list[float] = Field(min_length=3, max_length=3)


class SplitParams(BaseModel):
    cement_gap_mm: float = Field(default=0.08, ge=0.02, le=0.3)
    channel_wall_mm: float = Field(default=0.5, ge=0.2, le=1.5)
    bar_min_thickness_mm: float = Field(default=2.0, ge=0.5, le=5.0)
    blockout_step_mm: float = Field(default=0.2, ge=0.05, le=1.0)
    chimney_mode: Literal["through", "stop_below_occlusal"] = "through"


class SplitBarRequest(BaseModel):
    stl_path: str
    curve: list[list[float]] = Field(min_length=12)
    insertion_axis: list[float] = Field(min_length=3, max_length=3)
    channels: list[ChannelIn] = Field(default_factory=list)
    params: SplitParams = Field(default_factory=SplitParams)

    @field_validator("curve")
    @classmethod
    def curve_points_3d(cls, v: list[list[float]]) -> list[list[float]]:
        for p in v:
            if len(p) != 3:
                raise ValueError("Ogni punto della curva deve avere 3 coordinate")
        return v

    @field_validator("insertion_axis")
    @classmethod
    def axis_nonzero(cls, v: list[float]) -> list[float]:
        if sum(x * x for x in v) < 1e-9:
            raise ValueError("Asse di inserzione nullo")
        return v


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    import trimesh
    try:
        import manifold3d
        manifold_version = getattr(manifold3d, "__version__", "ok")
    except ImportError:
        manifold_version = None
    # bpy si importa nel subprocess della pipeline, non qui (import pesante):
    # riportiamo solo se il modulo è presente nell'ambiente
    import importlib.util
    bpy_present = importlib.util.find_spec("bpy") is not None
    return {
        "status": "ok",
        "version": "2.0",
        "engines": {
            "trimesh": trimesh.__version__,
            "manifold3d": manifold_version,
            "bpy_available": bpy_present,
        },
    }


@app.post("/api/upload")
async def upload(request: Request) -> dict:
    body = await request.body()
    if len(body) < 84:  # header STL binario minimo
        raise HTTPException(status_code=422, detail="File STL vuoto o troppo piccolo")
    name = f"upload_{uuid.uuid4().hex[:12]}.stl"
    path = UPLOAD_DIR / name
    path.write_bytes(body)
    return {"stl_path": str(path), "size": len(body)}


@app.post("/api/split-bar")
def split_bar(req: SplitBarRequest) -> dict:
    stl_path = Path(req.stl_path)
    # Accetta solo file dentro la directory upload (il client manda il path
    # ricevuto da /api/upload)
    if not stl_path.resolve().is_relative_to(UPLOAD_DIR.resolve()):
        raise HTTPException(status_code=422, detail="stl_path non valido")
    if not stl_path.exists():
        raise HTTPException(status_code=404, detail="STL non trovato: fai prima l'upload")

    job = jobs.create()
    out_dir = JOBS_DIR / job.id
    payload = {
        "stl_path": str(stl_path),
        "curve": req.curve,
        "insertion_axis": req.insertion_axis,
        "channels": [ch.model_dump() for ch in req.channels],
        "params": req.params.model_dump(),
    }
    jobs.submit(job, lambda j: run_split_bar_job(j, payload, out_dir))
    return {"job_id": job.id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job non trovato")
    return job.to_dict()


_SAFE_FILENAME = re.compile(r"^[A-Za-z0-9._-]+$")


@app.get("/api/download/{filename}")
def download(filename: str) -> FileResponse:
    if not _SAFE_FILENAME.match(filename):
        raise HTTPException(status_code=422, detail="Nome file non valido")
    # I risultati stanno in jobs/<id>/<file>; cerca nel job giusto dal nome
    for candidate in JOBS_DIR.glob(f"*/{filename}"):
        return FileResponse(candidate, media_type="model/stl", filename=filename)
    upload_candidate = UPLOAD_DIR / filename
    if upload_candidate.exists():
        return FileResponse(upload_candidate, media_type="model/stl", filename=filename)
    raise HTTPException(status_code=404, detail="File non trovato")
