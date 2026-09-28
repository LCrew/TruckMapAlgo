"""Raises Valhalla service limits for Baltic-wide truck matrices (default matrix limit is 400 km).
Run after the first tile build: python3 valhalla/scripts/apply_limits.py && docker compose restart valhalla"""
import json
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "custom_files" / "valhalla.json"
c = json.loads(p.read_text())
c["service_limits"]["truck"].update(
    max_matrix_distance=2_500_000, max_distance=5_000_000, max_locations=50, max_matrix_location_pairs=10_000)
c["service_limits"]["trace"].update(max_distance=1_000_000, max_shape=100_000)
p.write_text(json.dumps(c, indent=2))
print("Updated", p)
