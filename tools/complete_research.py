"""Inspect card-constructor metadata references without executing the game."""
import argparse
import json
from pathlib import Path
import struct

from research_native import PE


def inspect(game, research):
    import capstone
    binary = (game / 'GameAssembly.dll').read_bytes()
    pe = PE(binary)
    metadata = (game / 'Root_Data/il2cpp_data/Metadata/global-metadata.dat').read_bytes()
    index = json.loads((research / 'baseline/metadata-index.json').read_text(encoding='utf-8'))
    native = json.loads((research / 'native/native-index.json').read_text(encoding='utf-8'))
    type_offset, type_bytes = struct.unpack_from('<II', metadata, 8 + 19 * 8)
    byval = {}
    for type_id in range(type_bytes // 88):
        byval_index = struct.unpack_from('<I', metadata, type_offset + type_id * 88 + 8)[0]
        byval[byval_index] = type_id
    types = {entry['index']: entry for entry in index['candidate_types']}
    literal_offset, literal_bytes = struct.unpack_from('<II', metadata, 8)
    literal_data, literal_data_bytes = struct.unpack_from('<II', metadata, 16)
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
    md.detail = True
    report = []
    for method in native['methods']:
        if method['type'] not in ('AnvilFox', 'AmbushFox', 'ArmorersBird') or not method['bytes']:
            continue
        refs = []
        for instruction in md.disasm(binary[method['raw']:method['raw'] + method['bytes']], int(method['va'], 16)):
            for operand in instruction.operands:
                if operand.type != capstone.x86.X86_OP_MEM or operand.mem.base != capstone.x86.X86_REG_RIP:
                    continue
                address = instruction.address + instruction.size + operand.mem.disp
                try:
                    raw = pe.va_to_raw(address)
                    encoded = struct.unpack_from('<Q', binary, raw)[0]
                except (ValueError, struct.error):
                    continue
                kind = (encoded & 0xe0000000) >> 29
                number = (encoded & 0x1fffffff) >> 1
                if encoded > 0xffffffff or not encoded & 1 or not 1 <= kind <= 6:
                    continue
                item = {'instruction_va': hex(instruction.address), 'global_va': hex(address), 'encoded': hex(encoded), 'kind': kind, 'index': number}
                if kind in (1, 2):
                    t = types.get(byval.get(number))
                    if t:
                        item['type'] = t['namespace'] + '.' + t['name']
                        item['fields'] = [f['name'] for f in t['fields']]
                elif kind == 5 and number * 8 < literal_bytes:
                    length, data_index = struct.unpack_from('<II', metadata, literal_offset + number * 8)
                    if length < 200 and data_index + length <= literal_data_bytes:
                        item['literal'] = metadata[literal_data+data_index:literal_data+data_index+length].decode('utf-8', errors='replace')
                refs.append(item)
        report.append({'type': method['type'], 'method': method['method'], 'references': refs})
    out = research / 'samples/card-reference-evidence.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    for method in report:
        unique = {r.get('type') for r in method['references'] if 'type' in r}
        literals = {r.get('literal') for r in method['references'] if 'literal' in r}
        print(method['type'], method['method'], sorted(unique), sorted(literals))
    # Export exact, bounded additional method evidence for trait-layout and deck checks.
    module = native['module']
    additional = []
    for t in index['candidate_types']:
        if t['assembly'] != 'tuber-canis.dll':
            continue
        if t['name'] not in ('TuberAttributes', 'TuberPlaymat') and not t['name'].startswith('<GetDeck>'):
            continue
        for method in t['methods']:
            if t['name']=='TuberPlaymat' and method['name']!='GetDeck':
                continue
            token = int(method['token'],16)&0xffffff
            va = struct.unpack_from('<Q',binary,module['pointer_raw']+(token-1)*8)[0]
            if not va or not pe.executable(va):
                continue
            end = pe.function_end(va)
            if end is None or end-va>200000:
                continue
            offset=pe.va_to_raw(va)
            lines=[]
            for instruction in md.disasm(binary[offset:offset+end-va],va):
                note=''
                for operand in instruction.operands:
                    if operand.type==capstone.x86.X86_OP_MEM and operand.mem.base==capstone.x86.X86_REG_RIP:
                        address=instruction.address+instruction.size+operand.mem.disp
                        try: encoded=struct.unpack_from('<Q',binary,pe.va_to_raw(address))[0]
                        except (ValueError,struct.error): continue
                        if encoded<=0xffffffff and encoded&1 and (encoded>>29)==5:
                            number=(encoded&0x1fffffff)>>1
                            if number*8<literal_bytes:
                                length,data_index=struct.unpack_from('<II',metadata,literal_offset+number*8)
                                if length<120 and data_index+length<=literal_data_bytes:
                                    note=' ; '+metadata[literal_data+data_index:literal_data+data_index+length].decode('utf8',errors='replace')
                lines.append(f'{instruction.address:016x}  {instruction.mnemonic:8} {instruction.op_str}{note}')
            name=t['name'].replace('<','_').replace('>','_')+'-'+str(method['index'])+'.asm.txt'
            (research/'native'/name).write_text('\n'.join(lines)+'\n',encoding='utf8')
            additional.append({'type':t['name'],'method':method['name'],'va':hex(va),'bytes':end-va,'file':name,
                               'boundary': 'PE runtime-function region; cold blocks may lie outside this range'})
    (research/'samples/additional-native-evidence.json').write_text(json.dumps(additional,indent=2)+'\n',encoding='utf8')
    print(json.dumps(additional,ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game', type=Path)
    parser.add_argument('--research', type=Path, required=True)
    args = parser.parse_args()
    inspect(args.game, args.research)
