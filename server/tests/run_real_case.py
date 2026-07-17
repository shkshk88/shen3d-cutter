"""Esegue la pipeline S1–S10 su un caso reale preparato dall'harness frontend.

Uso: python3 server/tests/run_real_case.py test-assets/<caso>.job.json
Output: STL barra/sovrastruttura + report in test-assets/out/<caso>/
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from server.blender_ops.split_bar import run_pipeline  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    job_path = Path(sys.argv[1])
    job = json.loads(job_path.read_text())
    case_name = job_path.stem.replace(".job", "")
    out_dir = Path("test-assets/out") / case_name

    job["job_id"] = case_name
    job["out_dir"] = str(out_dir)

    print(f"=== {case_name} ===")
    print(f"curva: {len(job['curve'])} punti · canali: {len(job['channels'])}")

    t0 = time.time()
    try:
        report = run_pipeline(job)
    except Exception as exc:  # noqa: BLE001 — riporta lo stage fallito
        stage = getattr(exc, "stage", "?")
        print(f"FALLITO allo stage {stage}: {exc}")
        return 1
    elapsed = time.time() - t0

    print(f"\ncompletata in {elapsed:.1f}s")
    for stage, data in report["stages"].items():
        print(f"  {stage}: {data.get('seconds', '?')}s")

    result = report["result"]
    checks = result["checks"]
    print(f"\nbarra: {result['bar']['faces']} facce, {result['bar']['volume']:.0f} mm³, watertight={result['bar']['watertight']}")
    print(f"sovrastruttura: {result['superstructure']['faces']} facce, {result['superstructure']['volume']:.0f} mm³, watertight={result['superstructure']['watertight']}")
    print(f"\nchecks:")
    print(f"  no compenetrazione: {checks['no_interpenetration']} ({checks['parts_intersection_mm3']:.4f} mm³)")
    print(f"  fit passivo: {checks['insertion']}")
    print(f"  canali pervi: {checks['channels_patent']}")
    print(f"  gap: {checks['gap']}")
    print(f"  conservazione volume: {checks['volume_conservation']}")
    if report.get("warnings"):
        print(f"\nwarning: {report['warnings']}")

    (out_dir / "report.json").write_text(json.dumps(report, indent=2))
    print(f"\noutput in {out_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
