"""Convert extracted autumn scene to compact web geometry and WebP textures."""
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'research/art/autumn'
OUTPUT = ROOT / 'research/art/autumn-web'


def matrix(node):
    x, y, z, w = node['rotation']
    rotation = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    result = np.eye(4)
    result[:3, :3] = rotation @ np.diag(node['scale'])
    result[:3, 3] = node['position']
    return result


def run():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = json.loads((SOURCE/'scene.json').read_text(encoding='utf8'))
    nodes = {node['transformId']: node for node in source['nodes']}
    materials = {material['id']: material for material in source['materials']}
    meshes = {mesh['id']: mesh for mesh in source['meshes']}
    world = {}
    reflection = np.diag([-1, 1, 1, 1])

    def transform(node):
        key = node['transformId']
        if key not in world:
            parent = nodes.get(node['parentTransformId'])
            world[key] = (transform(parent) if parent else np.eye(4)) @ matrix(node)
        return world[key]

    def ancestors(node):
        result = []
        while node:
            result.append(node)
            node = nodes.get(node['parentTransformId'])
        return result

    selected = []
    for node in source['nodes']:
        mesh = node.get('mesh')
        if not mesh or mesh['fileId'] != 2 or not node.get('rendererEnabled'):
            continue
        chain = ancestors(node)
        if not all(parent['active'] for parent in chain):
            continue
        names = '/'.join(parent['name'] for parent in chain)
        if any(name in names for name in ['Low', 'Hint', 'Outline', 'Burrow', 'Gift', 'Cloud', 'Fog', 'Waterfall']):
            continue
        if 'DefaultBoard LOD' in names or 'G_env_Tree' in node['name'] or node['name'] == 'bush':
            selected.append(node)

    binary = bytearray()
    result = {'version': 1, 'sourceSha256': source['sha256'], 'geometry': {},
              'materials': {}, 'nodes': [], 'clearings': [], 'files': []}

    def append_array(values, dtype):
        array = np.asarray(values, dtype=dtype)
        record = {'offset': len(binary), 'length': array.size}
        binary.extend(array.tobytes())
        return record

    for key in sorted({node['mesh']['id'] for node in selected}):
        positions, normals, uvs, indices = [], [], [], []
        for line in (SOURCE/meshes[key]['file']).read_text(encoding='utf8').splitlines():
            parts = line.split()
            if not parts:
                continue
            if parts[0] == 'v':
                positions.extend(map(float, parts[1:4]))
            elif parts[0] == 'vn':
                normals.extend(map(float, parts[1:4]))
            elif parts[0] == 'vt':
                uvs.extend(map(float, parts[1:3]))
            elif parts[0] == 'f':
                indices.extend(int(vertex.split('/')[0])-1 for vertex in parts[1:4])
        result['geometry'][str(key)] = {
            'position': append_array(positions, '<f4'),
            'normal': append_array(normals, '<f4'),
            'uv': append_array(uvs, '<f4'),
            'index': append_array(indices, '<u4')}

    def publish(name, content):
        fingerprint = hashlib.sha256(content).hexdigest()[:12]
        stem, suffix = name.rsplit('.', 1)
        filename = f'{stem}.{fingerprint}.{suffix}'
        (OUTPUT/filename).write_bytes(content)
        url = '/assets/autumn/' + filename
        result['files'].append(url)
        return url

    texture_urls = {}
    for node in selected:
        material_ref = node['materials'][0]
        key = str(material_ref['id']) if material_ref['fileId'] == 2 else 'water'
        if key not in result['materials']:
            if key == 'water':
                result['materials'][key] = {'name': 'River', 'color': [0.38, 0.61, 0.63, 1]}
            else:
                material = materials[int(key)]
                color = material.get('colors', {}).get('_Color', [1, 1, 1, 1])
                if 'FadeClearing' in material['name']:
                    color = {'14': [0.71, 0.52, 0.43, 1], '25': [0.82, 0.43, 0.28, 1],
                             '35': [0.82, 0.71, 0.36, 1]}.get(key, [0.65, 0.68, 0.4, 1])
                record = {'name': material['name'], 'color': color}
                texture = next((item for item in material['textures'] if item['slot'] == '_MainTex'), None)
                if texture:
                    filename = texture['file']
                    if filename not in texture_urls:
                        image = Image.open(SOURCE/filename)
                        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                        import io
                        buffer = io.BytesIO()
                        image.save(buffer, 'WEBP', quality=85, method=6)
                        texture_urls[filename] = publish(Path(filename).stem + '.webp', buffer.getvalue())
                    record.update(texture=texture_urls[filename], offset=texture['offset'], scale=texture['scale'])
                result['materials'][key] = record
        converted = reflection @ transform(node) @ reflection
        result['nodes'].append({'name': node['name'], 'mesh': str(node['mesh']['id']),
                                'material': key, 'matrix': converted.T.flatten().round(7).tolist()})
    for clearing in source['clearings']:
        position = reflection @ transform(clearing) @ np.array([0, 0, 0, 1])
        result['clearings'].append({'id': clearing['index'], 'position': position[:3].round(6).tolist()})
    result['buffer'] = publish('geometry.bin', bytes(binary))
    manifest = OUTPUT/'scene.json'
    manifest.write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=False)+'\n', encoding='utf8')
    for path in [manifest, OUTPUT/Path(result['buffer']).name]:
        path.with_suffix(path.suffix+'.gz').write_bytes(gzip.compress(path.read_bytes(), mtime=0))
    print(json.dumps({'nodes': len(selected), 'meshes': len(result['geometry']),
                      'textures': len(texture_urls), 'geometryBytes': len(binary),
                      'textureBytes': sum((OUTPUT/Path(url).name).stat().st_size for url in texture_urls.values())}))


if __name__ == '__main__':
    run()
