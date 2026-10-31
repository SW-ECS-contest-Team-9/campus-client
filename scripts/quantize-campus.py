"""campus.glb 정점 양자화(KHR_mesh_quantization): POSITION float32 -> int16 정규화, NORMAL float32 -> int8 정규화.

  python scripts/quantize-campus.py <입력.glb> <출력.glb>

- three 의 GLTFLoader 가 해제기 없이 읽는 확장만 씀(meshopt·Draco 는 WASM 해제기가 필요해 Hermes 에서 못 씀).
- 위치는 노드별 범위로 [-1, 1] 에 넣고 노드 translation·scale 로 되돌림. 노드에 변환·자식이 있으면 건너뜀.
- f|… 층 판은 앱이 node.position.y 를 바꾸므로 건너뜀(translation 을 덮어씀).
- 결과의 위치 오차 최대값(m)을 출력함.
"""
import json, struct, sys
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
jn = struct.unpack('<I', b[12:16])[0]
g = json.loads(b[20:20 + jn])
B = b[20 + jn + 8:]
A, V = g['accessors'], g['bufferViews']
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}


def read(a):
    x = A[a]; v = V[x['bufferView']]
    assert 'byteStride' not in v and x.get('byteOffset', 0) == 0
    return np.frombuffer(B, DT[x['componentType']], x['count'] * 3, v.get('byteOffset', 0)).reshape(-1, 3)


new_views = {}  # bufferView -> (bytes, byteStride)
err = 0.0
for nd in g['nodes']:
    if 'mesh' not in nd or nd.get('name', '').startswith('f|'):
        continue
    if any(k in nd for k in ('translation', 'rotation', 'scale', 'matrix', 'children')):
        continue
    prims = g['meshes'][nd['mesh']]['primitives']
    pa = [p['attributes']['POSITION'] for p in prims]
    if any(A[a]['componentType'] != 5126 or A[a]['bufferView'] in new_views for a in pa):
        continue
    lo = np.min([A[a]['min'] for a in pa], axis=0); hi = np.max([A[a]['max'] for a in pa], axis=0)
    c = (lo + hi) / 2; s = np.maximum((hi - lo) / 2, 1e-6)
    for p in prims:
        a = p['attributes']['POSITION']; P = read(a).astype(np.float64)
        q = np.clip(np.round((P - c) / s * 32767), -32767, 32767).astype(np.int16)
        err = max(err, float(np.abs(q / 32767 * s + c - P).max()))
        out = np.zeros((len(q), 4), np.int16); out[:, :3] = q
        new_views[A[a]['bufferView']] = (out.tobytes(), 8)
        A[a].update(componentType=5122, normalized=True, min=q.min(0).tolist(), max=q.max(0).tolist())
        na = p['attributes'].get('NORMAL')
        if na is not None and A[na]['componentType'] == 5126 and A[na]['bufferView'] not in new_views:
            N = read(na)
            qn = np.clip(np.round(N * 127), -127, 127).astype(np.int8)
            outn = np.zeros((len(qn), 4), np.int8); outn[:, :3] = qn
            new_views[A[na]['bufferView']] = (outn.tobytes(), 4)
            A[na].update(componentType=5120, normalized=True)
            A[na].pop('min', None); A[na].pop('max', None)
    nd['translation'] = c.tolist(); nd['scale'] = s.tolist()

# 바이너리 다시 묶기(4바이트 정렬)
blob = bytearray()
for i, v in enumerate(V):
    data, stride = new_views.get(i, (B[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']], None))
    while len(blob) % 4: blob.append(0)
    v['byteOffset'] = len(blob); v['byteLength'] = len(data)
    if stride: v['byteStride'] = stride
    blob += data
while len(blob) % 4: blob.append(0)
g['buffers'][0]['byteLength'] = len(blob)
for k in ('extensionsUsed', 'extensionsRequired'):
    g[k] = sorted(set(g.get(k, [])) | {'KHR_mesh_quantization'})
js = json.dumps(g, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
js += b' ' * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(blob)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(blob), b'BIN\x00')); f.write(blob)
print(f'{len(b):,} -> {total:,} B, 바뀐 버퍼 {len(new_views)}, 위치 오차 최대 {err * 1000:.1f} mm')
