"""Read-only extraction of autumn scene geometry and its original references."""
import argparse
import hashlib
import json
from pathlib import Path
import re

import UnityPy


def vector(value, fields='xyz'):
    return [getattr(value, field) for field in fields]


def run(game):
    source = game / 'Root_Data/StreamingAssets/aa/StandaloneWindows64/defaultlocalgroup_scenes_all.bundle'
    output = Path(__file__).resolve().parents[1] / 'research/art/autumn'
    output.mkdir(parents=True, exist_ok=True)
    env = UnityPy.load(str(source))
    scene_id = '80d487fff8d40b6a93ddb2ffe34a7303'
    objects = [obj for obj in env.objects if scene_id in obj.assets_file.name]
    report = {'source': source.relative_to(game).as_posix(),
              'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'coordinateSystem': 'Original Unity local coordinates; OBJ uses UnityPy exporter conventions.',
              'meshes': [], 'materials': [], 'nodes': [], 'clearings': [], 'errors': []}
    for obj in objects:
        try:
            if obj.type.name == 'Mesh':
                data = obj.read()
                name = re.sub(r'[^\w.-]', '_', data.m_Name)
                target = output / f'{name}-{obj.path_id}.obj'
                target.write_text(data.export(), encoding='utf8')
                report['meshes'].append({'name': data.m_Name, 'id': obj.path_id,
                                         'file': target.name, 'bytes': target.stat().st_size})
            elif obj.type.name == 'Material':
                data = obj.read()
                textures = []
                for slot, value in data.m_SavedProperties.m_TexEnvs:
                    if not value.m_Texture.path_id:
                        continue
                    texture = value.m_Texture.read()
                    name = re.sub(r'[^\w.-]', '_', texture.m_Name)
                    target = output / f'{name}-{value.m_Texture.path_id}.png'
                    if not target.exists():
                        texture.image.save(target)
                    textures.append({'slot': slot, 'file': target.name,
                                     'offset': vector(value.m_Offset, 'xy'),
                                     'scale': vector(value.m_Scale, 'xy')})
                colors = {key: vector(value, 'rgba')
                          for key, value in data.m_SavedProperties.m_Colors}
                report['materials'].append({'name': data.m_Name, 'id': obj.path_id,
                                            'colors': colors, 'textures': textures})
            elif obj.type.name == 'GameObject':
                data = obj.read()
                components = {component.component.type.name: component.component
                              for component in data.m_Component}
                transform_ref = components.get('Transform')
                if not transform_ref:
                    continue
                transform = transform_ref.read()
                node = {'name': data.m_Name, 'id': obj.path_id,
                        'transformId': transform_ref.path_id,
                        'parentTransformId': transform.m_Father.path_id,
                        'active': data.m_IsActive,
                        'position': vector(transform.m_LocalPosition),
                        'rotation': vector(transform.m_LocalRotation, 'xyzw'),
                        'scale': vector(transform.m_LocalScale)}
                if 'MeshFilter' in components:
                    mesh = components['MeshFilter'].read().m_Mesh
                    node['mesh'] = {'id': mesh.path_id, 'fileId': mesh.file_id}
                if 'MeshRenderer' in components:
                    renderer = components['MeshRenderer'].read()
                    node['materials'] = [{'id': item.path_id, 'fileId': item.file_id}
                                         for item in renderer.m_Materials]
                    node['rendererEnabled'] = renderer.m_Enabled
                report['nodes'].append(node)
                match = re.fullmatch(r'P_Clearing_Default_(\d+)', data.m_Name)
                if match:
                    report['clearings'].append({'index': int(match[1]), **node})
        except Exception as error:
            report['errors'].append({'type': obj.type.name, 'id': obj.path_id,
                                     'error': str(error)})
    report['clearings'].sort(key=lambda item: item['index'])
    (output / 'scene.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({key: len(report[key]) for key in ['meshes', 'materials', 'nodes', 'clearings', 'errors']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game', type=Path)
    run(parser.parse_args().game)
