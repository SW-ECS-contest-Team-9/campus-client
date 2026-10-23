"""기기 경로 계산(src/route/route.ts)을 서버 계산(campus-backend mapdata/routing.py)과 맞춰 보는 시험 자료.

사용(백엔드 가상환경으로, shapely 필요):
  uv run --project <campus-backend 폴더> python scripts/build-route-fixture.py <campus-backend 폴더> <꾸러미 JSON> <출력 JSON>
꾸러미의 장소 쌍마다 7가지 방식으로 서버 MapIndex.route_points 를 돌려 결과(길 key·거리·시간)를 적는다
(꾸러미에 보행 그물 walkMeshes 가 있으면 그물 길찾기, 가상 길 key 는 w:<번호>:<그물 key>).
걷는 면·열린 면이 있으면 면마다 안쪽 한 점(shapely representative_point, 높이는 면 높이)에서 장소까지
7가지 방식(route_points), 이웃 면 점끼리 최단도 적는다(면 위 아무 점 출발 비교).
실내 층 그물(walkMeshes kind floor)도 층마다 한 점(통째로 쓰는 칸 가운데 꼭짓점 중 가운데 것)에서 같게 적는다.
"""

import json
import sys
from pathlib import Path

backend, pkg_path, out_path = sys.argv[1:4]
sys.path.insert(0, backend)
from shapely.geometry import MultiPolygon, Polygon  # noqa: E402

from mapdata.routing import MODES, MapIndex  # noqa: E402
from mapdata.surfaces import surface_z  # noqa: E402
from mapdata.walkmesh import Mesh  # noqa: E402

pkg = json.loads(Path(pkg_path).read_text(encoding="utf8"))
idx = MapIndex(pkg)
keys = sorted({p["nodeKey"] for p in pkg["places"] if p["nodeKey"]})
n = len(keys)
pairs = [(keys[i], keys[(i * 7 + 5) % n]) for i in range(n) if keys[i] != keys[(i * 7 + 5) % n]]


def result(r):
    if r is None:
        return {"ok": False}
    return {"ok": True, "edgeKeys": r["edgeKeys"], "distanceM": r["distanceM"], "durationS": r["durationS"]}


cases = []
for a, b in pairs:
    for m in MODES:
        cases.append({"from": a, "to": b, "mode": m} | result(idx.route_points(a, b, m)[0]))

points = []
for a in sorted(pkg.get("walkAreas", []), key=lambda a: a["key"]):
    if a["z"] is not None:
        c = Polygon(a["polygon"]).representative_point()
        points.append((a["key"], [round(c.x, 2), round(c.y, 2), round(float(a["z"]), 2)]))
for s in sorted(pkg.get("walkSurfaces", []), key=lambda s: s["key"]):
    c = MultiPolygon([Polygon(p[0], p[1:]) for p in s["polygons"]]).representative_point()
    points.append((s["key"], [round(c.x, 2), round(c.y, 2), round(surface_z(s["top"], c.x, c.y), 2)]))
for e in pkg.get("walkMeshes", []):
    if e["kind"] != "floor":
        continue
    M = Mesh(e, idx.edges, pkg["walkMeshClasses"])
    full = [k for k, c in enumerate(M.codes) if c == 15]
    if full:
        x, y, z = M.xyz(M.nc + full[len(full) // 2])
        points.append((e["key"], [round(x, 2), round(y, 2), round(z, 2)]))
point_cases = []
for i, (sk, pt) in enumerate(points):
    goal = keys[(i * 11 + 3) % n]
    for m in MODES:
        r, ends = idx.route_points(pt, goal, m)
        point_cases.append({"on": sk, "from": pt, "to": goal, "mode": m, "ends": ends} | result(r))
    nxt = points[(i + 1) % len(points)][1]
    r, ends = idx.route_points(pt, nxt, "shortest")
    point_cases.append({"on": sk, "from": pt, "to": nxt, "mode": "shortest", "ends": ends} | result(r))

src = pkg["release"]["source"]
Path(out_path).write_text(
    json.dumps(
        {"package": src, "version": pkg["release"]["version"], "cases": cases, "pointCases": point_cases},
        ensure_ascii=False,
    ),
    encoding="utf8",
)
attached = sum(1 for c in point_cases if c["ends"][0] and c["ends"][0]["attached"] == "surface")
print(
    f"{src} v{pkg['release']['version']}: 쌍 {len(pairs)} × 방식 {len(MODES)} = {len(cases)}, 길 없음 {sum(not c['ok'] for c in cases)}; "
    f"면 위 점 {len(points)} → {len(point_cases)}건(면에 붙음 {attached}, 길 없음 {sum(not c['ok'] for c in point_cases)})"
)
