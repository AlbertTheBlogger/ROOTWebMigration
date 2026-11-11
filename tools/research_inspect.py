"""Print bounded local research summaries, excluding raw localization text."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'research'
metadata = json.loads((root / 'baseline/metadata-index.json').read_text(encoding='utf-8'))
for category, pattern in [('map', ('Map', 'Clearing', 'Forest', 'Board', 'Playmat')), ('cards', ('CardArchetypes',)), ('flow', ('BattleActions', 'MarquiseDeCatActions'))]:
    print(category)
    rows = [t for t in metadata['candidate_types'] if t['assembly'] == 'tuber-canis.dll' and not t['name'].startswith('<') and any(s in (t['namespace'] if category in ('cards', 'flow') else t['name']) for s in pattern)]
    for t in rows[:90]:
        print(json.dumps({'index': t['index'], 'namespace': t['namespace'], 'name': t['name'], 'fields': [f['name'] for f in t['fields']], 'methods': [m['name'] for m in t['methods']][:14]}, ensure_ascii=False))
assets_path = root / 'assets/asset-index.json'
if assets_path.exists():
    assets = json.loads(assets_path.read_text(encoding='utf-8'))
    for file in assets['files']:
        print(file['source'])
        for obj in file['objects']:
            if obj.get('text_export'):
                print(json.dumps({k: obj[k] for k in ('name', 'text_export', 'text_prefix', 'text_length')}))
