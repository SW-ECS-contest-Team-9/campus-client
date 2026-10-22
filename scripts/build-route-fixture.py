"""기기 경로 계산(src/route/route.ts)을 서버 계산(campus-backend mapdata/routing.py)과 맞춰 보는 시험 자료.

사용: python scripts/build-route-fixture.py <campus-backend 폴더> <꾸러미 JSON> <출력 JSON>
꾸러미의 장소 쌍마다 7가지 방식으로 서버 MapIndex.route 를 돌려 결과(길 key·거리·시간)를 적는다.
"""

import json
import sys
from pathlib import Path

backend, pkg_path, out_path = sys.argv[1:4]
sys.path.insert(0, backend)
from mapdata.routing import MODES, MapIndex  # noqa: E402

pkg = json.loads(Path(pkg_path).read_text(encoding="utf8"))
idx = MapIndex(pkg)
keys = sorted({p["nodeKey"] for p in pkg["places"] if p["nodeKey"]})
n = len(keys)
pairs = [(keys[i], keys[(i * 7 + 5) % n]) for i in range(n) if keys[i] != keys[(i * 7 + 5) % n]]
cases = []
for a, b in pairs:
    for m in MODES:
        r = idx.route(a, b, m)
        cases.append(
            {"from": a, "to": b, "mode": m}
            | (
                {"ok": False}
                if r is None
                else {
                    "ok": True,
                    "edgeKeys": r["edgeKeys"],
                    "distanceM": r["distanceM"],
                    "durationS": r["durationS"],
                }
            )
        )
src = pkg["release"]["source"]
Path(out_path).write_text(
    json.dumps({"package": src, "version": pkg["release"]["version"], "cases": cases}, ensure_ascii=False),
    encoding="utf8",
)
print(f"{src}: 쌍 {len(pairs)} × 방식 {len(MODES)} = {len(cases)}, 길 없음 {sum(not c['ok'] for c in cases)}")
