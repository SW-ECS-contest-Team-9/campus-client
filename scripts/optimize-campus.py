"""Lossless vertex compaction for the exported campus GLB; remove interior helpers.

Preserves node metadata, transforms, primitive order, winding and all vertex attributes.
Usage: python optimize-campus.py INPUT OUTPUT [--remove-ground]
"""
import copy
import hashlib
import json
import struct
import sys


def read(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + size])
    binary_size, kind = struct.unpack_from('<II', data, 20 + size)
    assert kind == 0x004E4942
    return doc, data[28 + size:28 + size + binary_size], len(data)


def rows(doc, binary, index):
    a = doc['accessors'][index]
    assert 'sparse' not in a
    v = doc['bufferViews'][a['bufferView']]
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    width = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[a['componentType']] * count
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', width)
    return [binary[offset + i * stride:offset + i * stride + width] for i in range(a['count'])]


def digest(doc, binary, primitive):
    attrs = [rows(doc, binary, i) for _, i in sorted(primitive['attributes'].items())]
    inds = rows(doc, binary, primitive['indices'])
    h = hashlib.sha256()
    for row in inds:
        index = int.from_bytes(row, 'little')
        for a in attrs:
            h.update(a[index])
    return h.hexdigest()


def main():
    source, output = sys.argv[1:3]
    original, binary, before = read(source)
    assert not any(original.get(k) for k in ['skins', 'animations', 'images'])
    doc = copy.deepcopy(original)
    removed = {i for i, n in enumerate(doc['nodes']) if n.get('extras', {}).get('interior') or ('--remove-ground' in sys.argv and n.get('name') == 'ground')}
    assert all(not doc['nodes'][i].get('children') for i in removed)
    mapping = {old: new for new, old in enumerate(i for i in range(len(doc['nodes'])) if i not in removed)}
    doc['nodes'] = [n for i, n in enumerate(doc['nodes']) if i not in removed]
    for obj in doc['nodes'] + doc['scenes']:
        key = 'children' if obj in doc['nodes'] else 'nodes'
        if key in obj:
            obj[key] = [mapping[i] for i in obj[key] if i not in removed]
    used = sorted({n['mesh'] for n in doc['nodes'] if 'mesh' in n})
    mesh_map = {old: new for new, old in enumerate(used)}
    doc['meshes'] = [doc['meshes'][i] for i in used]
    for n in doc['nodes']:
        if 'mesh' in n:
            n['mesh'] = mesh_map[n['mesh']]
    doc['accessors'] = []
    doc['bufferViews'] = []
    result = bytearray()
    shared = {}

    def add(template, values, target):
        payload = b''.join(values)
        a = {k: v for k, v in template.items() if k not in ('bufferView', 'byteOffset', 'count')}
        a['count'] = len(values)
        key = (json.dumps(a, sort_keys=True), target, payload)
        if key in shared:
            return shared[key]
        result.extend(b'\0' * (-len(result) % 4))
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(result), 'byteLength': len(payload), 'target': target})
        result.extend(payload)
        a['bufferView'] = view
        index = len(doc['accessors'])
        doc['accessors'].append(a)
        shared[key] = index
        return index

    checks = []
    vertices_before = vertices_after = 0
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            assert not p.get('targets') and not p.get('extensions')
            checks.append(digest(original, binary, p))
            attrs = {name: rows(original, binary, index) for name, index in p['attributes'].items()}
            old_indices = [int.from_bytes(r, 'little') for r in rows(original, binary, p['indices'])]
            lookup, selected, indices = {}, [], []
            for i in old_indices:
                key = tuple(a[i] for a in attrs.values())
                if key not in lookup:
                    lookup[key] = len(selected)
                    selected.append(i)
                indices.append(lookup[key])
            vertices_before += len(attrs['POSITION'])
            vertices_after += len(selected)
            for name, index in list(p['attributes'].items()):
                p['attributes'][name] = add(original['accessors'][index], [attrs[name][i] for i in selected], 34962)
            template = copy.deepcopy(original['accessors'][p['indices']])
            width = 2 if len(selected) <= 65535 else 4
            template['componentType'] = 5123 if width == 2 else 5125
            template.pop('min', None)
            template.pop('max', None)
            p['indices'] = add(template, [i.to_bytes(width, 'little') for i in indices], 34963)
    doc['buffers'] = [{'byteLength': len(result)}]
    actual = [digest(doc, result, p) for m in doc['meshes'] for p in m['primitives']]
    assert checks == actual, 'Vertex stream changed'
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    result.extend(b'\0' * (-len(result) % 4))
    total = 28 + len(encoded) + len(result)
    with open(output, 'wb') as f:
        f.write(struct.pack('<IIIII', 0x46546C67, 2, total, len(encoded), 0x4E4F534A))
        f.write(encoded)
        f.write(struct.pack('<II', len(result), 0x004E4942))
        f.write(result)
    read(output)
    print(json.dumps({'before': before, 'after': total, 'savedPercent': round(100 * (1 - total / before), 1), 'removedNodes': len(removed), 'verticesBefore': vertices_before, 'verticesAfter': vertices_after, 'primitiveStreamsVerified': len(checks)}))


if __name__ == '__main__':
    main()
