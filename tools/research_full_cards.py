"""Recover remaining base-deck crafting arrays from local constructor evidence."""
import json
from pathlib import Path
import re
import struct

ROOT=Path(__file__).resolve().parents[1]
SUITS=['rabbit','fox','mouse','wild']
KINDS={'ScoutingPartyMouse':'scouting','CobblerRabbit':'cobbler','CommandWarrenRabbit':'commandwarren',
       'BetterBurrowBankRabbit':'bank','TaxCollectorFox':'tax','CodebreakersMouse':'codebreakers',
       'RoyalClaimBird':'royalclaim','StandandDeliverFox':'standdeliver','SappersBird':'sappers',
       'BrutalTacticsBird':'brutal'}


def recover_cost(report):
    rows=report['instructions']
    start=next(i for i,r in enumerate(rows) if r['mnemonic']=='mov' and re.fullmatch(r'r(?:bx|di), qword ptr \[rcx \+ 0x88\]',r['operands']))
    end=next(i for i in range(start+1,len(rows)) if rows[i]['mnemonic']=='call' and rows[i]['operands']=='0x18032b4f0')
    allocation=next(i for i in range(start+1,end) if rows[i]['mnemonic']=='call' and rows[i]['operands']=='0x1820ded50')
    length_row=next(r for r in reversed(rows[max(0,start-6):allocation]) if r['mnemonic'] in ('lea','mov') and r['operands'].startswith('edx,'))
    op=length_row['operands']
    length=int(re.search(r'(0x[0-9a-f]+|[0-9]+)(?:\])?$',op)[1],0)
    if '[rbp' in op and not any(r['mnemonic']=='xor' and r['operands']=='ebp, ebp' for r in rows[:start]):
        raise ValueError('Unknown array length register')
    if not 1<=length<=4: raise ValueError('Unexpected crafting array length')
    values=[0]*length
    initializers=[r for r in rows[allocation+1:end] if r['mnemonic']=='call']
    if any(r['operands']!='0x180f7a2b0' for r in initializers): raise ValueError('Unknown crafting array initializer')
    field_data=[ref for r in rows[allocation+1:end] if r['mnemonic']=='mov' for ref in r['references'] if ref['kind']=='field_data']
    if initializers and len(field_data)!=1: raise ValueError('Unresolved static crafting array data')
    for r in rows[allocation+1:end]:
        for ref in r['references']:
            if ref['kind']=='field_data' and r['mnemonic']=='mov':
                values=list(struct.unpack('<'+'i'*length,bytes.fromhex(ref['bytes'])[:4*length]))
        if r['mnemonic']=='mov':
            match=re.fullmatch(r'dword ptr \[rax \+ (0x[0-9a-f]+)\], (0x[0-9a-f]+|[0-9]+|ebp)',r['operands'])
            if match:
                slot=(int(match[1],0)-0x20)//4
                if not 0<=slot<length: raise ValueError('Crafting array bounds')
                values[slot]=0 if match[2]=='ebp' else int(match[2],0)
    if any(v not in range(4) for v in values): raise ValueError('Unknown crafting suit')
    return {'cost':[SUITS[v] for v in values],'attribute_va':rows[start]['va'],'allocation_va':rows[allocation]['va']}


def run():
    catalog=json.loads((ROOT/'backend/data/base-card-catalog.json').read_text(encoding='utf8'))
    evidence=[]
    for card in catalog['cards']:
        if card['kind']=='ambush': continue
        report=json.loads((ROOT/f'research/deck/{card["type"]}-ctor.json').read_text(encoding='utf8'))
        result=recover_cost(report)
        if card['cost'] is not None and card['cost']!=result['cost']: raise ValueError('Recipe disagreement')
        card['cost']=result['cost']
        if card['type'].startswith('Favorof'):
            card['kind']='favor'
        elif card['kind']=='unimplemented':
            card['kind']=KINDS[card['type']]
        evidence.append({'type':card['type'],**result})
    (ROOT/'research/deck/full-cost-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
    (ROOT/'backend/data/full-card-catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(evidence))


if __name__=='__main__': run()
