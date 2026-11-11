"""Inspect selected Unity bundles read-only; exports research JSON, never game files."""
import argparse
from collections import Counter
import gc
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import re
import sys


def run(game, out, selects):
    import UnityPy
    game = game.resolve(strict=True)
    out = out.resolve()
    if out == game or game in out.parents:
        raise ValueError('Output must be outside original game')
    out.mkdir(parents=True, exist_ok=True)
    sources = set()
    data = game / 'Root_Data'
    for pattern in selects:
        sources.update(p for p in data.glob(pattern) if p.is_file())
    manifest = {'tool': 'tools/research_assets.py', 'python': sys.version.split()[0], 'unitypy': version('UnityPy'), 'read_only': True, 'files': []}
    for source in sorted(sources):
        print('Inspecting', source.name, flush=True)
        record = {'source': source.relative_to(game).as_posix(), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'objects': [], 'exports': [], 'errors': []}
        try:
            env = UnityPy.load(str(source))
            record['containers'] = [{'path': k, 'path_id': p.path_id} for k, p in env.container.items()]
            counts = Counter()
            for obj in env.objects:
                typename = obj.type.name
                counts[typename] += 1
                if typename not in ('MonoBehaviour', 'MonoScript', 'TextAsset', 'GameObject'):
                    continue
                item = {'path_id': obj.path_id, 'asset_file': obj.assets_file.name, 'type': typename}
                try:
                    item['name'] = obj.peek_name()
                except Exception as exc:
                    item['name_error'] = f'{type(exc).__name__}: {str(exc)[:160]}'
                if typename in ('MonoBehaviour', 'MonoScript'):
                    try:
                        tree = obj.parse_as_dict()
                        item['keys'] = list(tree)
                        if typename == 'MonoScript':
                            item['script'] = {k: tree.get(k) for k in ('m_ClassName', 'm_Namespace', 'm_AssemblyName')}
                        else:
                            item['script_ref'] = tree.get('m_Script')
                            name = item.get('name') or tree.get('m_Name') or ''
                            # Only structural data is exported, not textures/audio or arbitrary text.
                            if len(tree) > 5:
                                safe = re.sub(r'[^\w.-]+', '_', str(name))[:80]
                                file = f'{source.stem}/{obj.path_id}-{safe}.json'
                                target = out / 'trees' / file
                                target.parent.mkdir(parents=True, exist_ok=True)
                                target.write_text(json.dumps(tree, ensure_ascii=False, indent=2, default=str) + '\n', encoding='utf-8')
                                record['exports'].append({'path_id': obj.path_id, 'name': name, 'file': 'trees/' + file})
                    except Exception as exc:
                        item['parse_error'] = f'{type(exc).__name__}: {str(exc)[:250]}'
                if typename == 'TextAsset' and item.get('name') in ('en_US', 'zh_CN'):
                    try:
                        text = obj.parse_as_object().m_Script
                        if isinstance(text, bytes):
                            text = text.decode('utf-8-sig')
                        target = out / 'localization' / (item['name'] + '.txt')
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_text(text, encoding='utf-8')
                        item['text_export'] = target.relative_to(out).as_posix()
                        item['text_prefix'] = text[:120]
                        item['text_length'] = len(text)
                    except Exception as exc:
                        item['parse_error'] = f'{type(exc).__name__}: {str(exc)[:250]}'
                record['objects'].append(item)
            record['object_counts'] = dict(counts)
            del env
        except Exception as exc:
            record['errors'].append(f'{type(exc).__name__}: {str(exc)[:300]}')
        manifest['files'].append(record)
        (out / 'asset-index.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'source': source.name, 'counts': record.get('object_counts'), 'exported': len(record['exports']), 'parse_failures': sum('parse_error' in o for o in record['objects']), 'errors': record['errors']}, ensure_ascii=False), flush=True)
        gc.collect()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('game', type=Path)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--select', action='append', required=True)
    a = p.parse_args()
    run(a.game, a.output, a.select)
