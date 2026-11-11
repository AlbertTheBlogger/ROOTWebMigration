"""Produce traceable research samples and a bounded report from extracted local evidence."""
from collections import Counter
from importlib.metadata import distributions
import hashlib
import json
from pathlib import Path
import re


def properties(path):
    result = {}
    for number, line in enumerate(path.read_text(encoding='utf-8-sig').splitlines(), 1):
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        result[key] = {'value': value, 'line': number}
    return result


def run():
    root = Path(__file__).resolve().parents[1]
    research = root/'research'
    output = research/'samples'
    output.mkdir(exist_ok=True)
    metadata = json.loads((research/'baseline/metadata-index.json').read_text(encoding='utf-8'))
    assets = json.loads((research/'assets/asset-index.json').read_text(encoding='utf-8'))
    native = json.loads((research/'native/native-index.json').read_text(encoding='utf-8'))
    catalog_path=research/'deck/card-catalog.json'
    catalog=json.loads(catalog_path.read_text(encoding='utf8')) if catalog_path.exists() else None
    if catalog and catalog['source_sha256']!=native['sha256']:
        raise ValueError('Card catalog source fingerprint differs from native evidence')
    locales = {locale: properties(research/f'assets/localization/{locale}.txt') for locale in ('en_US','zh_CN')}
    cards = []
    for typename, key, category in [('AnvilFox','anvil','item_crafting'), ('AmbushFox','ambush','ambush'), ('ArmorersBird','armorers','persistent_battle_effect')]:
        t = next(t for t in metadata['candidate_types'] if t['name']==typename and t['assembly']=='tuber-canis.dll')
        entry = {'type':typename, 'category':category, 'metadata_type_index':t['index'], 'metadata_token':t['token'], 'suit_from_type_name':'bird' if typename.endswith('Bird') else 'fox', 'copy_count':None, 'crafting_cost':None, 'status':'type-and-text-confirmed-full-numeric-traits-pending', 'localization':{}}
        for locale, strings in locales.items():
            keys = [k for k in strings if k==f'root.cardname.{key}' or k==f'root.cardtext.{key}' or (key=='ambush' and k in ('root.cardtext.ambush.fox','root.cardtext.ambush.startofbattle'))]
            entry['localization'][locale] = {'source':f'../assets/localization/{locale}.txt', 'sha256':hashlib.sha256((research/f'assets/localization/{locale}.txt').read_bytes()).hexdigest(), 'entries':{k:strings[k] for k in keys}}
        entry['native_methods'] = [m for m in native['methods'] if m['type']==typename]
        if catalog:
            definition=next(c for c in catalog['cards'] if c['type']==typename)
            entry.update(copy_count=definition['count'],crafting_cost=definition['cost'],
                         status='static-deck-count-and-supported-recipe-confirmed-runtime-pending',
                         numeric_evidence='../deck/card-catalog.json',crafting_applicable=definition['kind']!='ambush')
        if typename=='AnvilFox':
            text = locales['en_US'].get('root.cardtext.anvil',{}).get('value','')
            points = re.search(r'sprite name="(\d+)VP"',text)
            entry['item_from_text'] = 'hammer' if 'sprite name="hammer"' in text else None
            entry['points_from_text'] = int(points[1]) if points else None
        cards.append(entry)
    (output/'card-samples.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    flow_names = {'Battle','ChooseAmbushCards','SetAttackerAmbushCard','SetDefenderAmbushCard','StandardBattleResolution','PerformBattle','FieldHospitalResolution','DeferredFieldHospitalChoice','FieldHospitalAtKeepChoice','RemoveWoodForBuilding','RemoveChosenWood'}
    types = [t for t in metadata['candidate_types'] if t['assembly']=='tuber-canis.dll' and t['name'] in flow_names]
    flow = {'status':'static-structure-not-runtime-sequence', 'types':types, 'limits':['Names and fields locate research targets but do not establish the complete execution order.', 'Iterator/state-machine MoveNext bodies require separate analysis.', 'No original game behavior was executed or observed in this round.']}
    (output/'flow-evidence.json').write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    mapdata = json.loads((output/'fall-map.json').read_text(encoding='utf-8'))
    c = [n for n in mapdata['nodes'] if n['node_type']=='clearing']
    checks = {'clearing_count':len(c), 'forest_count':len(mapdata['nodes'])-len(c), 'suit_counts':dict(Counter(n['suit'] for n in c)), 'building_slots':sum(n['building_slots'] for n in c), 'ruin_clearings':[n['id'] for n in c if n['ruin']], 'starting_clearings':[n['id'] for n in c if n['starting']], 'path_count':sum(len(n['paths']) for n in c)//2, 'river_edges':sum(len(n['river_neighbors']) for n in c)//2}
    by_id = {n['id']:n for n in c}
    assert checks['suit_counts']=={'fox':4,'rabbit':4,'mouse':4}
    assert len(checks['ruin_clearings'])==4 and len(checks['starting_clearings'])==4
    for n in c:
        assert n['building_slots']>0
        for other in n['river_neighbors']:
            assert n['id'] in by_id[other]['river_neighbors']
    seen, todo = set(),[c[0]['id']]
    while todo:
        idx=todo.pop()
        if idx in seen: continue
        seen.add(idx)
        todo.extend(by_id[idx]['paths'])
    assert len(seen)==12
    checks['path_graph_connected']=True
    checks['river_adjacency_symmetric']=True
    (output/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Schematic only: positions are manually chosen for the research view, not extracted coordinates.
    positions={0:(95,80),1:(350,65),2:(610,80),3:(330,200),4:(80,310),5:(290,365),6:(480,410),7:(650,300),8:(610,630),9:(420,610),10:(250,665),11:(70,600)}
    colors={'rabbit':'#e0bd6f','fox':'#c87c58','mouse':'#a9bed4'}
    svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 770"><rect width="740" height="770" fill="#f5f1e6"/><text x="25" y="28" font-size="17">秋季地图：静态提取拓扑研究图</text>']
    for node in c:
        x,y=positions[node['id']]
        for other in node['paths']:
            if other>node['id']:
                xx,yy=positions[other];svg.append(f'<path d="M{x} {y}L{xx} {yy}" stroke="#7e806c" stroke-width="4"/>')
        for other in node['river_neighbors']:
            if other>node['id']:
                xx,yy=positions[other];svg.append(f'<path d="M{x} {y}L{xx} {yy}" stroke="#589eae" stroke-width="6" stroke-dasharray="8 5"/>')
    for node in c:
        x,y=positions[node['id']]
        label=f'{node["id"]} · {node["suit"]}'
        detail=f'{node["building_slots"]} slots'+(' · ruin' if node['ruin'] else '')+(' · corner' if node['starting'] else '')
        svg.append(f'<circle cx="{x}" cy="{y}" r="43" fill="{colors[node["suit"]]}" stroke="#455645" stroke-width="2"/><text x="{x}" y="{y-2}" font-size="13" text-anchor="middle">{label}</text><text x="{x}" y="{y+16}" font-size="10" text-anchor="middle">{detail}</text>')
    svg.append('<text x="25" y="735" font-size="12">实线：道路；蓝色虚线：河流。图示位置非原版坐标，尚待原版画面与运行核验。</text></svg>')
    (output/'fall-map.svg').write_text('\n'.join(svg),encoding='utf-8')
    installed = sorted(f'{d.metadata["Name"]}=={d.version}' for d in distributions() if d.metadata['Name'] not in ('pip','setuptools'))
    (research/'requirements.lock.txt').write_text('\n'.join(installed)+'\n',encoding='utf-8')
    summary = {'map_checks':checks, 'card_samples':len(cards), 'flow_types':len(types), 'asset_tree_exports':sum(len(f['exports']) for f in assets['files']), 'asset_parse_failures':sum('parse_error' in o for f in assets['files'] for o in f['objects']), 'localized_languages_exported':['en_US','zh_CN'], 'native_selected_methods':len(native['methods']), 'native_disassembly_files':sum('disassembly' in m for m in native['methods'])}
    (output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))


if __name__=='__main__':
    run()
