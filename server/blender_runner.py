"""Esegue la pipeline split bar in un subprocess per job.

Un crash del kernel geometrico (boolean, bpy) uccide il job, non il server.
Il child è lo stesso interprete Python del server (bpy installato via pip);
se bpy non è importabile, la pipeline usa i fallback numpy/trimesh.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from .jobs import Job

PIPELINE_SCRIPT = Path(__file__).parent / "blender_ops" / "split_bar.py"
JOB_TIMEOUT_SECONDS = 600


def run_split_bar_job(job: Job, job_payload: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    job_payload = {**job_payload, "job_id": job.id, "out_dir": str(out_dir)}

    job_file = out_dir / "job.json"
    job_file.write_text(json.dumps(job_payload))

    job.stage = "S1"
    try:
        proc = subprocess.run(
            [sys.executable, str(PIPELINE_SCRIPT), "--job", str(job_file)],
            capture_output=True,
            text=True,
            timeout=JOB_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        job.status = "error"
        job.error = f"Timeout dopo {JOB_TIMEOUT_SECONDS}s"
        return

    report_path = out_dir / "report.json"
    report: dict | None = None
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text())
        except json.JSONDecodeError:
            report = None

    if proc.returncode == 0 and report and report.get("status") == "done":
        job.report = report
        job.status = "done"
        job.stage = "S3"
        return

    job.status = "error"
    if report:
        job.failed_stage = report.get("failed_stage")
        job.error = report.get("error", "Errore sconosciuto")
    else:
        # Il processo è morto senza scrivere il report (segfault, OOM…)
        tail = (proc.stderr or "").strip().splitlines()[-5:]
        job.error = "Processo pipeline terminato senza report: " + " | ".join(tail)
