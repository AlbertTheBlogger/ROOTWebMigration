"""Build item-card recipes from bounded constructor evidence and localization."""
import json
from pathlib import Path
import re

from research_samples import properties


ROOT=Path(__file__).resolve().parents[1]
SUITS={0:'rabbit',1:'fox',2:'mouse',3:'wild'}


def item_recipe(report):
    instructions=report['instructions']
    costs=[i for i,r in enumerate(instructions) if r['mnemonic']=='mov' and r['operands']=='rbx, qword ptr [rcx + 0x88]']
    if len(costs)!=1:
        raise ValueError('Expected one recognized crafting-cost assignment')
    start=costs[0]
    end=next(i for i in range(start+1,len(instructions)) if instructions[i]['mnemonic']=='call' and instructions[i]['operands']=='0x18032b4f0')
    block=instructions[start:end+1]
    # Constructors zero EBP, allocate a fresh zero-filled Int32 array, and write constants.
    if not any(r['mnemonic']=='xor' and r['operands']=='ebp, ebp' for r in instructions[:start]):
        raise ValueError('Unknown zero register')
    allocation=next(i for i,r in enumerate(block) if r['mnemonic']=='call' and r['operands']=='0x1820ded50')
    length_setup=[r for r in instructions[max(0,start-5):start]+block[:allocation] if r['mnemonic'] in ('lea','mov') and r['operands'].startswith('edx,')]
    setup=length_setup[-1]['operands']
    match=re.fullmatch(r'edx, \[rbp \+ (0x[0-9a-f]+|[0-9]+)\]',setup)
    length=int(match[1],0) if match else int(setup.split(', ')[1],0)
    if not 1<=length<=4:
        raise ValueError('Unexpected recipe length')
    values=[0]*length
    writes=[]
    for r in block[allocation+1:]:
        if r['mnemonic']!='mov':
            continue
        match=re.fullmatch(r'dword ptr \[rax \+ (0x[0-9a-f]+)\], (0x[0-9a-f]+|[0-9]+|ebp)',r['operands'])
        if match:
            slot=(int(match[1],0)-0x20)//4
            if not 0<=slot<length:
                raise ValueError('Recipe array write outside bounds')
            values[slot]=0 if match[2]=='ebp' else int(match[2],0)
            writes.append(r['va'])
        elif 'ptr [rax +' in r['operands'] and not r['operands'].startswith(('r8,','r9,','rcx,','rdx,')):
            raise ValueError('Unrecognized recipe array write')
    if any(value not in SUITS for value in values):
        raise ValueError('Unknown crafting suit')
    point_index=next(i for i,r in enumerate(instructions) if r['mnemonic']=='mov' and r['operands']=='rbx, qword ptr [rcx + 0x90]')
    point_setups=[r for r in instructions[point_index-7:point_index] if r['mnemonic']=='mov' and re.fullmatch(r'edx, (0x[0-9a-f]+|[0-9]+)',r['operands'])]
    if len(point_setups)!=1:
        raise ValueError('Unresolved item victory points')
    points=int(point_setups[0]['operands'].split(', ')[1],0)
    return {'cost':[SUITS[value] for value in values],'points':points,
            'evidence':{'cost_attribute_va':instructions[start]['va'],'array_write_vas':writes,'points_va':point_setups[0]['va']}}


def run():
    research=ROOT/'research'
    composition=json.loads((research/'deck/deck-composition.json').read_text(encoding='utf8'))
    names=properties(research/'assets/localization/zh_CN.txt')
    texts=properties(research/'assets/localization/en_US.txt')
    catalog=[]
    item_types=set(composition['counts']['ItemsOnlyDeck'])
    for typename,count in composition['counts']['DrawDeck'].items():
        report=json.loads((research/f'deck/{typename}-ctor.json').read_text(encoding='utf8'))
        literals={ref['value'] for r in report['instructions'] for ref in r['references'] if ref['kind']=='literal'}
        keys={s for s in literals if s.startswith('root.cardname.')}
        if len(keys)!=1:
            raise ValueError('Unresolved card name '+typename)
        key=next(iter(keys))
        suit=next(SUITS[v] for suffix,v in [('Rabbit',0),('Fox',1),('Mouse',2),('Bird',3)] if typename.endswith(suffix))
        card={'type':typename,'name':names[key]['value'],'suit':suit,'count':count,'kind':'unimplemented','cost':None}
        if typename in item_types:
            recipe=item_recipe(report)
            text_keys={s for s in literals if s.startswith('root.cardtext.') and '.override.' not in s}
            if len(text_keys)!=1:
                raise ValueError('Unresolved item text '+typename)
            text=texts[next(iter(text_keys))]['value']
            icons=re.findall(r'<sprite name="([a-z]+)"',text)
            items=set(icons)&{'boot','bag','sack','hammer','sword','crossbow','tea','teapot','coin','coins','coinstack'}
            if len(items)!=1:
                raise ValueError('Unknown item icon '+repr((typename,icons)))
            card.update(recipe,kind='item',item={'sack':'bag','coins':'coin','coinstack':'coin','teapot':'tea'}.get(next(iter(items)),next(iter(items))))
            if f'"{recipe["points"]}VP"' not in text:
                raise ValueError('Native points disagree with localized item text')
        elif typename.startswith('Ambush'):
            card['kind']='ambush'
        elif typename=='ArmorersBird':
            card.update(kind='armorers',cost=['fox'])
        card['constructor_va']=report['start']
        catalog.append(card)
    shared=json.loads((research/'deck/TuberPlaymat-sharedInit.json').read_text(encoding='utf8'))
    supply={}
    supply_evidence=[]
    item_enum=next(e for e in json.loads((research/'baseline/enum-evidence.json').read_text(encoding='utf8')) if e['type']=='ItemTypes')
    item_names={'Sack':'bag','Boot':'boot','Crossbow':'crossbow','Hammer':'hammer','Sword':'sword','TeaPot':'tea','GoldStack':'coin'}
    enum_names={e['value_as_compressed_int32']:item_names[e['field']] for e in item_enum['values'] if e['field'] in item_names}
    for i,inst in enumerate(shared['instructions']):
        if 'TuberPlaymat.createItem' not in inst['calls']:
            continue
        setup=shared['instructions'][i-3:i]
        if setup[0]['operands']!='r8d, r8d' or setup[0]['mnemonic']!='xor':
            raise ValueError('Unknown item initialization arguments')
        op=setup[1]['operands']
        match=re.fullmatch(r'edx, \[r8 \+ (0x[0-9a-f]+|[0-9]+)\]',op)
        value=0 if setup[1]['mnemonic']=='xor' and op=='edx, edx' else int(match[1],0) if match else None
        if value not in enum_names:
            raise ValueError('Unresolved supply item')
        name=enum_names[value]
        supply[name]=supply.get(name,0)+1
        supply_evidence.append({'item':name,'enum':value,'call_va':inst['va']})
    if sum(supply.values())!=12:
        raise ValueError('Unexpected initial crafting supply')
    result={'source_sha256':composition['source_sha256'],'deck_field':'StandardDecks.DrawDeck','total':sum(c['count'] for c in catalog),'cards':catalog,'item_supply':supply,'supply_evidence':supply_evidence,
            'limits':['DominanceCards is a separate original static list, not merged into this DrawDeck export.','Unimplemented effects are marked explicitly.','Armorers cost independently checked in its constructor; suit labels also checked against type suffixes.']}
    (research/'deck/card-catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    runtime={key:result[key] for key in ('source_sha256','deck_field','total','item_supply')}
    runtime['cards']=[{key:value for key,value in card.items() if key not in ('evidence','constructor_va')} for card in catalog]
    (ROOT/'backend/data/base-card-catalog.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps([dict(type=c['type'],count=c['count'],cost=c['cost'],item=c.get('item'),points=c.get('points')) for c in catalog],ensure_ascii=False))


if __name__=='__main__':
    run()
