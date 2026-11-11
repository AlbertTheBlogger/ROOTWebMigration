"""Recover the original quest requirements and Alliance sympathy track."""
import json
from pathlib import Path
import re

from research_samples import properties

ROOT = Path(__file__).resolve().parents[1]
ITEMS = ['bag', 'boot', 'crossbow', 'hammer', 'sword', 'tea', 'torch', 'coin']


def run():
    deck = json.loads((ROOT/'research/four-factions/deck-composition.json').read_text())
    strings = properties(ROOT/'research/assets/localization/zh_CN.txt')
    quests = []
    for name in deck['counts']['VagabondQuestDeck']:
        report = json.loads((ROOT/f'research/four-factions/{name}-ctor.json').read_text())
        # Managed Int32[2] allocations are zero-initialized (bag has enum value 0).
        values = {'0x20': 0, '0x24': 0}
        for row in report['instructions']:
            packed = re.fullmatch(r'qword ptr \[rax \+ 0x20\], (\d+)', row['operands'])
            if row['mnemonic'] == 'mov' and packed:
                value = int(packed[1])
                values.update({'0x20': value & 0xffffffff, '0x24': value >> 32})
            match = re.fullmatch(r'dword ptr \[rax \+ (0x20|0x24)\], (\d+|edi)', row['operands'])
            if row['mnemonic'] == 'mov' and match:
                values[match[1]] = 0 if match[2] == 'edi' else int(match[2])
        assert set(values) == {'0x20', '0x24'}, name
        key = next(ref['value'] for row in report['instructions'] for ref in row['references']
                   if ref['kind'] == 'literal' and ref['value'].startswith('root.quest.')
                   and not ref['value'].startswith('root.quest.clearingtype'))
        suit = next(suffix.lower() for suffix in ['Fox', 'Mouse', 'Rabbit'] if name.endswith(suffix))
        quests.append({'id': name, 'name': strings[key]['value'], 'suit': suit,
                       'items': [ITEMS[values['0x20']], ITEMS[values['0x24']]], 'source': report['start']})
    report = json.loads((ROOT/'research/four-factions/WoodlandAlliancePlayer-initialize.json').read_text())
    track = []
    current = None
    for row in report['instructions']:
        if row['operands'] == 'qword ptr [rdi + 0x10], 1':
            current = {'cost': 1, 'points': 0}
        if current is None:
            continue
        match = re.fullmatch(r'(dword|qword) ptr \[rdi \+ (0x10|0x14)\], (\d+)', row['operands'])
        if row['mnemonic'] == 'mov' and match:
            value = int(match[3])
            if match[2] == '0x10':
                current['cost'] = value & 0xffffffff
                if match[1] == 'qword': current['points'] = value >> 32
            else:
                current['points'] = value & 0xffffffff
        if re.fullmatch(r'qword ptr \[rbx \+ 0x[0-9a-f]+\], rdi', row['operands']):
            track.append(current)
            if len(track) == 10: break
            current = {'cost': 0, 'points': 0}
    assert len(track) == 10
    result = {'sourceSha256': deck['source_sha256'], 'quests': quests, 'sympathyTrack': track,
              'ruleSource': 'https://cdn.shopify.com/s/files/1/0106/0162/7706/files/Root_Base_Law_Oct_2025.pdf?v=1774903756'}
    (ROOT/'backend/data/four-faction-catalog.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'quests': len(quests), 'sympathyTrack': track}))


if __name__ == '__main__':
    run()
