"""Inspect the original standard-deck initializer without executing game code."""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
import struct

from research_native import PE


def inspect(game, output):
    import capstone
    research = Path(__file__).resolve().parents[1] / 'research'
    binary = (game / 'GameAssembly.dll').read_bytes()
    pe = PE(binary)
    native = json.loads((research/'native/native-index.json').read_text(encoding='utf8'))
    if hashlib.sha256(binary).hexdigest() != native['sha256']:
        raise ValueError('Source fingerprint changed')
    metadata = (game/'Root_Data/il2cpp_data/Metadata/global-metadata.dat').read_bytes()
    index = json.loads((research/'baseline/metadata-index.json').read_text(encoding='utf8'))
    types = index['candidate_types']
    module = native['module']
    pointers = struct.unpack_from('<'+'Q'*module['count'], binary, module['pointer_raw'])
    lookup = {}
    for t in types:
        if t['assembly'] == 'tuber-canis.dll':
            for m in t['methods']:
                address = pointers[(int(m['token'],16)&0xffffff)-1]
                lookup.setdefault(address, []).append(t['name']+'.'+m['name'])
    type_offset, type_bytes = struct.unpack_from('<II',metadata,8+19*8)
    byval = {struct.unpack_from('<I',metadata,type_offset+t['index']*88+8)[0]: t for t in types}
    raw_types={struct.unpack_from('<I',metadata,type_offset+i*88+8)[0]:struct.unpack_from('<16I8H2I',metadata,type_offset+i*88) for i in range(type_bytes//88)}
    field_refs,field_ref_bytes=struct.unpack_from('<II',metadata,8+22*8)
    default_offset,default_bytes=struct.unpack_from('<II',metadata,8+7*8)
    default_data,default_data_bytes=struct.unpack_from('<II',metadata,8+8*8)
    defaults={r[0]:r for r in (struct.unpack_from('<3I',metadata,p) for p in range(default_offset,default_offset+default_bytes,12))}
    literal_offset, literal_bytes = struct.unpack_from('<II',metadata,8)
    literal_data, literal_data_bytes = struct.unpack_from('<II',metadata,16)

    def reference(address):
        try:
            encoded = struct.unpack_from('<Q',binary,pe.va_to_raw(address))[0]
        except (ValueError, struct.error):
            return None
        if encoded > 0xffffffff or not encoded&1:
            return None
        kind, number = encoded>>29, (encoded&0x1fffffff)>>1
        if kind==4 and number*8<field_ref_bytes:
            type_id,local_field=struct.unpack_from('<2I',metadata,field_refs+number*8)
            owner=raw_types.get(type_id)
            if owner and local_field<owner[18]:
                field=owner[8]+local_field
                default=defaults.get(field)
                if default and default[2]<default_data_bytes:
                    start=default_data+default[2]
                    return {'kind':'field_data','field_index':field,'metadata_offset':start,'bytes':metadata[start:start+32].hex()}
        if kind in (1,2) and number in byval:
            return {'kind':'type','name':byval[number]['name'],'type_index':byval[number]['index']}
        if kind==5 and number*8<literal_bytes:
            length,start=struct.unpack_from('<II',metadata,literal_offset+number*8)
            if length<150 and start+length<=literal_data_bytes:
                return {'kind':'literal','value':metadata[literal_data+start:literal_data+start+length].decode('utf8',errors='replace')}
        return None

    output.mkdir(parents=True,exist_ok=True)
    md = capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64)
    md.detail=True
    reports=[]
    targets=[('StandardDecks','.cctor'),('TuberPlaymat','GetDeck'),('TuberAttributes','.cctor'),('TuberPlaymat','initialize'),('TuberPlaymat','sharedInit')]
    targets += [(t['name'],'.ctor') for t in types if t['assembly']=='tuber-canis.dll' and 1177 <= t['index'] <= 1218]
    targets += [('MarquiseDeCatArchetype','.ctor'),('EyrieDynastiesArchetype','.ctor')]
    targets += [('EyrieDynastiesPlayer','AdditionalDraws'),('MarquiseDeCatPlayer','AdditionalDraws'),('MarquiseDeCatPlayer','GetBuildingCost'),('MarquiseDeCatPlayer','GetDrawRateForBuilding'),('MarquiseDeCatPlayer','GetTrackInfo')]
    targets += [('EyrieDynastiesPlayer','initialize')]
    targets += [('WoodlandAlliancePlayer','initialize'),('WoodlandAlliancePlayer','AdditionalDraws'),('WoodlandAlliancePlayer','CostOfSpreadingSympathy'),('WoodlandAlliancePlayer','GetVPForSpreadingSympathy')]
    quest_names=extract_decks(json.loads((research/'deck/StandardDecks-cctor.json').read_text(encoding='utf8')),types)['counts']['VagabondQuestDeck']
    targets += [(name,'.ctor') for name in quest_names]
    for name, method_name in targets:
        t=next(t for t in types if t['name']==name and t['assembly']=='tuber-canis.dll')
        m=next(m for m in t['methods'] if m['name']==method_name)
        start=pointers[(int(m['token'],16)&0xffffff)-1]
        # This is a bounded address window, not a claim of recovered function boundaries.
        end=min(p for p in pointers if p>start)
        if end-start>250000:
            raise ValueError('Inspection window exceeds limit')
        raw=pe.va_to_raw(start)
        instructions=[]
        for inst in md.disasm(binary[raw:raw+end-start],start):
            refs=[]
            for operand in inst.operands:
                if operand.type==capstone.x86.X86_OP_MEM and operand.mem.base==capstone.x86.X86_REG_RIP:
                    ref=reference(inst.address+inst.size+operand.mem.disp)
                    if ref: refs.append(ref)
            calls=[]
            if inst.mnemonic in ('call','jmp') and inst.operands[0].type==capstone.x86.X86_OP_IMM:
                calls=lookup.get(inst.operands[0].imm,[])
            instructions.append({'va':hex(inst.address),'mnemonic':inst.mnemonic,'operands':inst.op_str,'references':refs,'calls':calls})
        filename=name+'-'+method_name.replace('.','')+'.json'
        report={'type':name,'method':method_name,'start':hex(start),'window_end':hex(end),'runtime_region_end':hex(pe.function_end(start) or 0),'boundary':'next mapped method address; inspect control flow before interpreting','source_sha256':native['sha256'],'instructions':instructions}
        (output/filename).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        lines=[f"{r['va']} {r['mnemonic']:8} {r['operands']}  {json.dumps(r['references'],ensure_ascii=False) if r['references'] else ''} {' | '.join(r['calls'])}" for r in instructions]
        (output/(name+'-'+method_name.replace('.','')+'.asm.txt')).write_text('\n'.join(lines)+'\n',encoding='utf8')
        reports.append({'type':name,'bytes':end-start,'instructions':len(instructions),'file':filename})
    print(json.dumps(reports))
    deck_report=extract_decks(json.loads((output/'StandardDecks-cctor.json').read_text(encoding='utf8')),types)
    (output/'deck-composition.json').write_text(json.dumps(deck_report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({name:dict(total=len(cards),types=len(set(c['type'] for c in cards))) for name,cards in deck_report['decks'].items()}))


def extract_decks(report, types):
    """Recognize bounded, unrolled List.Add initializers, preserving each append address."""
    fields=next(t['fields'] for t in types if t['name']=='StandardDecks')
    decks={}
    entries=[]
    current_type=None
    active=False
    for inst in report['instructions']:
        op=inst['operands']
        if inst['mnemonic']=='mov' and op=='rbx, rax':
            if active:
                raise ValueError('Uncommitted list before next allocation')
            active=True
            entries=[]
            current_type=None
        if not active:
            continue
        if inst['mnemonic']=='mov' and '[rip ' in op:
            refs=[r for r in inst['references'] if r['kind']=='type' and r['name']!='StandardDecks']
            if refs:
                current_type=refs[0]['name']
        appended=(inst['mnemonic']=='inc' and op=='dword ptr [rbx + 0x1c]') or (inst['mnemonic']=='call' and op=='0x181f356a0')
        if appended:
            if current_type is None:
                raise ValueError('Unresolved appended archetype')
            entries.append({'type':current_type,'append_va':inst['va']})
        store=re.fullmatch(r'qword ptr \[rcx(?: \+ (0x[0-9a-f]+|[0-9]+))?\], rbx',op)
        if inst['mnemonic']=='mov' and store:
            field_offset=int(store[1] or '0',0)
            if field_offset%8 or field_offset//8>=len(fields):
                raise ValueError('Invalid deck static field')
            name=fields[field_offset//8]['name']
            if name in decks or not entries:
                raise ValueError('Duplicate or empty deck')
            decks[name]=entries
            active=False
    if active or len(decks)!=len(fields):
        raise ValueError('Incomplete deck initializer')
    return {'source_sha256':report['source_sha256'],'initializer_va':report['start'],
            'method':'unrolled inline List.Add and shared Add call, grouped by static-field stores',
            'limits':['Static initialization evidence; original runtime has not been observed.'],
            'decks':decks,'counts':{name:dict(Counter(e['type'] for e in entries)) for name,entries in decks.items()}}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    inspect(args.game,args.output)
