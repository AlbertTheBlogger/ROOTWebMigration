"""Bounded symbolic scan of the verified FallBoardLayout constructor, not a general emulator."""
import json
from pathlib import Path
import re


def recover(lines):
    regs, stack, lists, nodes, corners = {}, {}, {}, [], {}
    last_list = None
    last_node = None
    fresh = 0
    def reg(name):
        aliases = {'eax':'rax','ebx':'rbx','ecx':'rcx','edx':'rdx','ebp':'rbp','esi':'rsi','edi':'rdi','r8d':'r8','r9d':'r9','r14d':'r14'}
        return aliases.get(name, name)
    def val(token):
        try:
            return int(token, 0)
        except ValueError:
            return regs.get(reg(token))
    for line in lines:
        m = re.match(r'([0-9a-f]{16})\s+(\w+)\s*(.*?)(?: ; (.*))?$', line.strip())
        if not m:
            continue
        addr, op, operands, annotation = m.groups()
        parts = operands.split(', ', 1)
        if op == 'mov' and len(parts) == 2:
            dest, source = parts
            if re.fullmatch(r'(r\w+|e\w+)', dest):
                regs[reg(dest)] = val(source)
            sm = re.fullmatch(r'qword ptr \[rsp \+ (0x[0-9a-f]+)\]', dest)
            if sm:
                stack[int(sm[1], 16)] = val(source)
            if dest == 'dword ptr [rdx + rcx*4 + 0x20]':
                value = val(source)
                if last_list is None or not isinstance(value, int):
                    raise ValueError(f'Unresolved list append at {addr}')
                lists[last_list].append(value)
        elif op == 'xor' and len(parts) == 2 and parts[0] == parts[1]:
            regs[reg(parts[0])] = 0
        elif op == 'lea' and len(parts) == 2:
            dest, source = parts
            lm = re.fullmatch(r'\[(\w+) ([+-]) (0x[0-9a-f]+|\d+)\]', source)
            if lm and isinstance(val(lm[1]), int):
                regs[reg(dest)] = val(lm[1]) + (1 if lm[2] == '+' else -1)*int(lm[3],0)
            else:
                regs[reg(dest)] = None
        elif op == 'call':
            target = int(operands, 16)
            ret = None
            if target == 0x1820dfb80:  # Native allocation, represented symbolically only.
                fresh += 1
                ret = f'object-{fresh}'
            elif target == 0x180a1f500:  # Observed shared List<T> constructor.
                owner = regs.get('rcx')
                if not isinstance(owner, str):
                    raise ValueError(f'Unknown list owner at {addr}')
                lists[owner] = []
                last_list = owner
            elif target == 0x181f37d70:  # Non-inlined integer List.Add calls in this constructor.
                owner, value = regs.get('rcx'), regs.get('rdx')
                if owner not in lists or not isinstance(value, int):
                    raise ValueError(f'Unresolved list call at {addr}')
                lists[owner].append(value)
            elif annotation == 'TuberBoardNodeLayout.ClearingNode':
                args = [regs.get(r) for r in ('rcx','rdx','r8','r9')]
                neighbors = stack.get(0x20)
                river = stack.get(0x28)
                if not all(isinstance(v,int) for v in args) or neighbors not in lists or (river != 0 and river not in lists):
                    raise ValueError(f'Unresolved clearing arguments at {addr}: {args}, {neighbors}, {river}')
                last_node = {'id': args[0], 'priority': args[1], 'suit_code': args[2], 'building_slots': args[3], 'node_type':'clearing', 'neighbors': lists[neighbors].copy(), 'river_neighbors': lists[river].copy() if river else [], 'starting': False, 'ruin': False, 'edge': False, 'source_call_va': '0x'+addr}
                nodes.append(last_node)
                ret = 'node-'+str(args[0])
            elif annotation == 'TuberBoardNodeLayout.ForestNode':
                idx, owner = regs.get('rcx'), regs.get('rdx')
                if not isinstance(idx,int) or owner not in lists:
                    raise ValueError('Unresolved forest arguments')
                last_node = {'id':idx, 'node_type':'forest', 'neighbors':lists[owner].copy(), 'river_neighbors':[], 'source_call_va':'0x'+addr}
                nodes.append(last_node)
                ret = 'node-'+str(idx)
            elif annotation and annotation.startswith('TuberBoardNodeLayout.WithIs'):
                key = {'TuberBoardNodeLayout.WithIsStartingLocation':'starting', 'TuberBoardNodeLayout.WithIsRuinLocation':'ruin', 'TuberBoardNodeLayout.WithIsEdgeLocation':'edge'}[annotation]
                if last_node is None:
                    raise ValueError('Flag with no node')
                last_node[key] = True
                ret = 'node-'+str(last_node['id'])
            elif target == 0x18076da20:
                key, value = regs.get('rdx'), regs.get('r8')
                if not isinstance(key,int) or not isinstance(value,int):
                    raise ValueError('Unresolved opposite corner')
                corners[key] = value
            for r in ('rax','rcx','rdx','r8','r9','r10','r11'):
                regs[r] = None
            regs['rax'] = ret
    ids = {n['id'] for n in nodes}
    if len(nodes) != 19 or len(ids) != 19 or sum(n['node_type']=='clearing' for n in nodes) != 12:
        raise ValueError('Expected 12 clearings and 7 forests')
    for node in nodes:
        for other in node['neighbors']:
            if other not in ids or node['id'] not in next(n for n in nodes if n['id']==other)['neighbors']:
                raise ValueError(f'Non-symmetric adjacency {node["id"]} -> {other}')
        if node['node_type']=='clearing':
            node['paths'] = [x for x in node['neighbors'] if x<12]
            node['adjacent_forests'] = [x for x in node['neighbors'] if x>=12]
    if len(corners) != 4 or any(corners.get(v) != k for k,v in corners.items()):
        raise ValueError('Invalid opposite corner dictionary')
    return {'map_id':'digital-fall-research-v1', 'status':'static-extraction-awaiting-visual-and-runtime-crosscheck', 'nodes':nodes, 'opposite_corners':corners, 'limits':['Numeric suit codes require separately verified enum mapping.', 'Coordinates and art were not extracted.', 'The bounded scanner is pinned to the recorded binary and constructor layout.']}


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]/'research'
    native = json.loads((root/'native/native-index.json').read_text(encoding='utf-8'))
    if native['sha256'] != 'a32ee3d3fcf9d8357249505f5491faeb4ac75949213bdd2a4a60201e4c1158f9':
        raise ValueError('Binary fingerprint changed; scanner requires new review')
    result = recover((root/'native/FallBoardLayout-4141.asm.txt').read_text(encoding='utf-8').splitlines())
    enums = json.loads((root/'baseline/enum-evidence.json').read_text(encoding='utf-8'))
    suits = next(e for e in enums if e['type']=='Suits')
    suit_names = {v['value_as_compressed_int32']:v['field'].lower() for v in suits['values']}
    for node in result['nodes']:
        if node['node_type']=='clearing':
            node['suit'] = suit_names[node['suit_code']]
    result['suit_evidence'] = '../baseline/enum-evidence.json'
    result['limits'][0] = 'Suit codes were cross-checked against metadata constants; visual/runtime map crosscheck is still pending.'
    result['source_sha256'] = native['sha256']
    result['source_method_rva'] = next(m['rva'] for m in native['methods'] if m['type']=='FallBoardLayout' and m['method']=='.ctor')
    out = root/'samples'
    out.mkdir(exist_ok=True)
    (out/'fall-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
