"""Read-only baseline and IL2CPP v29 metadata index; no native code execution."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import xml.etree.ElementTree as ET

FORMAT_SOURCE = 'https://github.com/SamboyCoding/Cpp2IL/tree/development/LibCpp2IL/Metadata'


def compressed_int(data, pos):
    if not 0 <= pos < len(data):
        raise ValueError('Compressed integer position out of bounds')
    first = data[pos]
    length = 1 if first < 128 or first in (254,255) else 5 if first == 240 else 4 if first & 192 == 192 else 2
    if pos+length > len(data):
        raise ValueError('Truncated compressed integer')
    if first < 128:
        unsigned, length = first, 1
    elif first == 240:
        unsigned, length = struct.unpack_from('<I', data, pos+1)[0], 5
    elif first == 255:
        unsigned, length = 0xffffffff, 1
    elif first == 254:
        unsigned, length = 0xfffffffe, 1
    elif first & 192 == 192:
        unsigned, length = ((first & 63) << 24) | int.from_bytes(data[pos+1:pos+4], 'big'), 4
    else:
        unsigned, length = ((first & 127) << 8) | data[pos+1], 2
    if pos+length > len(data):
        raise ValueError('Truncated compressed integer')
    if unsigned == 0xffffffff:
        return -2147483648, length
    return (-(unsigned//2+1) if unsigned & 1 else unsigned//2), length


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def metadata_index(path):
    blob = path.read_bytes()
    magic, version = struct.unpack_from('<II', blob)
    if magic != 0xFAB11BAF or version != 29:
        raise ValueError('Only standard IL2CPP metadata v29 is supported')
    def section(index, stride=1):
        offset, size = struct.unpack_from('<II', blob, 8 + index * 8)
        if offset < 256 or offset + size > len(blob) or size % stride:
            raise ValueError(f'Invalid metadata section {index}')
        return offset, size
    strings_offset, strings_size = section(2)
    heap = blob[strings_offset:strings_offset + strings_size]
    def text(index):
        if not 0 <= index < strings_size:
            raise ValueError('String index out of bounds')
        end = heap.find(b'\0', index)
        if end < 0:
            raise ValueError('Unterminated string')
        return heap[index:end].decode('utf-8', errors='strict')
    mo, ms = section(5, 32)
    fo, fs = section(11, 12)
    po, ps = section(10, 12)
    to, ts = section(19, 88)
    io, ins = section(20, 40)
    methods = [struct.unpack_from('<6I4H', blob, p) for p in range(mo, mo + ms, 32)]
    fields = [struct.unpack_from('<3I', blob, p) for p in range(fo, fo + fs, 12)]
    parameters = [struct.unpack_from('<3I', blob, p) for p in range(po, po + ps, 12)]
    do, ds = section(7, 12)
    dvo, dvs = section(8)
    defaults = {row[0]: row for row in (struct.unpack_from('<3I', blob, p) for p in range(do, do+ds, 12))}
    images = []
    ownership = {}
    for p in range(io, io + ins, 40):
        row = struct.unpack_from('<10I', blob, p)
        item = {'name': text(row[0]), 'type_start': row[2], 'type_count': row[3]}
        if row[2] + row[3] > ts // 88:
            raise ValueError('Image type range out of bounds')
        images.append(item)
        for idx in range(row[2], row[2] + row[3]):
            if idx in ownership:
                raise ValueError('Overlapping image type ranges')
            ownership[idx] = item['name']
    types = []
    for idx, p in enumerate(range(to, to + ts, 88)):
        row = struct.unpack_from('<16I8H2I', blob, p)
        if row[-1] >> 24 != 2:
            raise ValueError('Unexpected TypeDef token; unsupported layout')
        method_start, method_count = row[9], row[16]
        field_start, field_count = row[8], row[18]
        if method_count and method_start + method_count > len(methods):
            raise ValueError('Method range out of bounds')
        if field_count and field_start + field_count > len(fields):
            raise ValueError('Field range out of bounds')
        type_methods = []
        for method_idx in range(method_start, method_start + method_count):
            m = methods[method_idx]
            if m[1] != idx or m[5] >> 24 != 6:
                raise ValueError('Method ownership/token mismatch')
            if m[-1] and m[3]+m[-1] > len(parameters):
                raise ValueError('Parameter range out of bounds')
            args = parameters[m[3]:m[3]+m[-1]] if m[-1] else []
            if any(a[1] >> 24 != 8 for a in args):
                raise ValueError('Parameter token mismatch')
            type_methods.append({'index': method_idx, 'name': text(m[0]), 'parameter_count': m[-1], 'parameters': [text(a[0]) for a in args], 'token': hex(m[5])})
        type_fields = []
        for field_idx in range(field_start, field_start + field_count):
            f = fields[field_idx]
            if f[2] >> 24 != 4:
                raise ValueError('Field token mismatch')
            type_fields.append({'index': field_idx, 'name': text(f[0]), 'type_index': f[1]})
        types.append({'index': idx, 'assembly': ownership.get(idx), 'namespace': text(row[1]), 'name': text(row[0]), 'token': hex(row[-1]), 'metadata_offset': p, 'fields': type_fields, 'methods': type_methods})
    candidates = [t for t in types if any(word in (t['namespace'] + '.' + t['name']).lower() for word in ('tuber', 'root', 'canis'))]
    enum_evidence = []
    for t in candidates:
        if t['assembly'] == 'tuber-canis.dll' and t['name'] in ('Suits', 'MapLayout', 'BattlePhases', 'ItemTypes'):
            values = []
            for f in t['fields']:
                d = defaults.get(f['index'])
                if d and d[2] != 0xffffffff:
                    if d[2] >= dvs:
                        raise ValueError('Default outside constant data')
                    value, size = compressed_int(blob[dvo:dvo+dvs], d[2])
                    values.append({'field': f['name'], 'value_as_compressed_int32': value, 'metadata_offset': dvo+d[2], 'raw_bytes': blob[dvo+d[2]:dvo+d[2]+size].hex(), 'type_index': d[1]})
            enum_evidence.append({'type': t['name'], 'namespace': t['namespace'], 'type_index': t['index'], 'values': values})
    return {'metadata_version': version, 'format_reference': FORMAT_SOURCE, 'layout': {'type_bytes': 88, 'method_bytes': 32, 'field_bytes': 12, 'image_bytes': 40}, 'validation': 'section bounds, strides, type tokens, field tokens, method tokens, method owners and parameter tokens checked', 'image_count': len(images), 'type_count': len(types), 'method_count': len(methods), 'field_count': len(fields), 'images': images, 'candidate_types': candidates, 'enum_evidence': enum_evidence, 'limits': ['Types, fields and method names are metadata evidence only; no method bodies recovered.', 'No claim that a named method implements the inferred behavior.']}


def run(game, out):
    game = game.resolve(strict=True)
    out = out.resolve()
    if out == game or game in out.parents:
        raise ValueError('Research output must be outside source game directory')
    data = game / 'Root_Data'
    out.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(game.rglob('*')):
        if path.is_file() and not path.is_symlink():
            files.append({'path': path.relative_to(game).as_posix(), 'bytes': path.stat().st_size})
    inputs = [data / 'StreamingAssets/aa/catalog.json', data / 'StreamingAssets/aa/settings.json', data / 'StreamingAssets/aa/AddressablesLink/link.xml', data / 'il2cpp_data/Metadata/global-metadata.dat', game / 'GameAssembly.dll']
    manifest = {'source_directory': str(game), 'read_only': True, 'python': sys.version.split()[0], 'tool': 'tools/research_baseline.py', 'input_hashes': {p.relative_to(game).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}, 'source_executed': False}
    catalog = json.loads(inputs[0].read_text(encoding='utf-8-sig'))
    write_json(out / 'catalog-summary.json', {'keys': {k: {'type': type(v).__name__, 'length': len(v) if isinstance(v, (str, list, dict)) else None} for k, v in catalog.items()}, 'internal_ids': catalog.get('m_InternalIds', []), 'resource_types': catalog.get('m_resourceTypes', catalog.get('m_ResourceTypes', []))})
    linked = []
    for asm in ET.parse(inputs[2]).getroot().findall('assembly'):
        for node in asm.findall('type'):
            linked.append({'assembly': asm.get('fullname'), 'type': node.get('fullname')})
    write_json(out / 'linked-types.json', linked)
    index = metadata_index(inputs[3])
    write_json(out / 'metadata-index.json', index)
    write_json(out / 'enum-evidence.json', index['enum_evidence'])
    keywords = {'battle': r'battle|ambush|hospital|wound|damage', 'map': r'clearing|forest|map|path|ruin', 'card': r'card|deck|craft|item', 'cat': r'marquise|wood|sawmill', 'bird': r'eyrie|decree|roost|turmoil', 'expansion': r'hundred|keeper|relic|corvid|duchy|riverfolk|lizard|hireling'}
    hits = {}
    for topic, pattern in keywords.items():
        rx = re.compile(pattern, re.I)
        hits[topic] = [t for t in index['candidate_types'] if rx.search(t['name'])]
    write_json(out / 'rule-type-candidates.json', hits)
    rows = []
    for item in files:
        name = item['path'].lower()
        topics = [topic for topic, pattern in keywords.items() if re.search(pattern, name)]
        if topics and (name.endswith('.bundle') or 'localization' in name):
            rows.append({**item, 'topics': '|'.join(topics), 'evidence': 'file name only', 'playable_content_verified': 'false'})
    with (out / 'content-matrix.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=['path', 'bytes', 'topics', 'evidence', 'playable_content_verified'])
        writer.writeheader()
        writer.writerows(rows)
    manifest['results'] = {k: index[k] for k in ('image_count', 'type_count', 'method_count', 'field_count')}
    manifest['results'].update(candidate_types=len(index['candidate_types']), linked_types=len(linked), topic_counts={key: len(value) for key, value in hits.items()})
    write_json(out / 'manifest.json', manifest)
    print(json.dumps(manifest['results'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('game', type=Path)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    run(a.game, a.output)
