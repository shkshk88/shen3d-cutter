"""Job store in-memory con esecuzione seriale (tool single-user)."""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass
class Job:
    id: str
    status: str = "queued"  # queued | running | done | error
    stage: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    error: Optional[str] = None
    failed_stage: Optional[str] = None
    report: Optional[dict] = None

    def to_dict(self) -> dict:
        payload = {
            "job_id": self.id,
            "status": self.status,
            "stage": self.stage,
            "error": self.error,
            "failed_stage": self.failed_stage,
        }
        if self.report and self.status == "done":
            payload["result"] = self.report.get("result")
            payload["stages"] = self.report.get("stages")
            payload["engine"] = self.report.get("engine")
        return payload


class JobStore:
    def __init__(self, max_workers: int = 1):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers)

    def create(self) -> Job:
        job = Job(id=uuid.uuid4().hex[:12])
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def submit(self, job: Job, fn: Callable[[Job], None]) -> None:
        def wrapper() -> None:
            job.status = "running"
            job.started_at = time.time()
            try:
                fn(job)
                if job.status == "running":
                    job.status = "done"
            except Exception as exc:  # noqa: BLE001 — lo stato del job deve riflettere il crash
                job.status = "error"
                job.error = f"{type(exc).__name__}: {exc}"
            finally:
                job.finished_at = time.time()

        self._executor.submit(wrapper)
