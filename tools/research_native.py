"""Resolve a bounded set of IL2CPP method addresses from PE data; never load the DLL."""
import argparse
from bisect import bisect_right
import hashlib
import json
from pathlib import Path
import struct


class PE:
    def __init__(self, blob):
        self.blob = blob
        if blob[:2] != b'MZ':
            raise ValueError('Expected PE image')
        pe = struct.unpack_from('<I', blob, 0x3c)[0]
        if blob[pe:pe+4] != b'PE\0\0' or struct.unpack_from('<H', blob, pe+24)[0] != 0x20b:
            raise ValueError('Expected PE32+')
        count, optional_size = struct.unpack_from('<H', blob, pe+6)[0], struct.unpack_from('<H', blob, pe+20)[0]
        self.base = struct.unpack_from('<Q', blob, pe+48)[0]
        self.sections = []
        for i in range(count):
            p = pe+24+optional_size+i*40
            name = blob[p:p+8].rstrip(b'\0').decode('ascii')
            vs, rva, raw_size, raw = struct.unpack_from('<4I', blob, p+8)
            characteristics = struct.unpack_from('<I', blob, p+36)[0]
            self.sections.append({'name': name, 'rva': rva, 'virtual_size': vs, 'raw_size': raw_size, 'raw': raw, 'executable': bool(characteristics & 0x20000000)})
        self.functions = []
        for s in self.sections:
            if s['name'] == '.pdata':
                for p in range(s['raw'], s['raw']+s['raw_size']-11, 12):
                    start, end, unwind = struct.unpack_from('<3I', blob, p)
                    if start and end > start:
                        self.functions.append((start, end))
        self.functions.sort()
        self.starts = [f[0] for f in self.functions]

    def va_to_raw(self, va):
        rva = va-self.base
        for s in self.sections:
            delta = rva-s['rva']
            if 0 <= delta < min(s['virtual_size'], s['raw_size']):
                return s['raw']+delta
        raise ValueError(f'VA outside mapped file: {hex(va)}')

    def raw_to_va(self, raw):
        for s in self.sections:
            delta = raw-s['raw']
            if 0 <= delta < s['raw_size']:
                return self.base+s['rva']+delta
        raise ValueError('Raw position outside sections')

    def executable(self, va):
        return any(s['executable'] and s['rva'] <= va-self.base < s['rva']+s['virtual_size'] for s in self.sections)

    def function_end(self, va):
        i = bisect_right(self.starts, va-self.base)-1
        if i >= 0 and self.functions[i][0] == va-self.base:
            return self.base+self.functions[i][1]
        return None


def run(game, index_path, output):
    import capstone
    game = game.resolve(strict=True)
    output = output.resolve()
    if game == output or game in output.parents:
        raise ValueError('Output must be outside source game')
    output.mkdir(parents=True, exist_ok=True)
    blob = (game/'GameAssembly.dll').read_bytes()
    pe = PE(blob)
    index = json.loads(index_path.read_text(encoding='utf-8'))
    expected = 'tuber-canis.dll'
    types = [t for t in index['candidate_types'] if t['assembly'] == expected]
    max_token = max(int(m['token'], 16) & 0xffffff for t in types for m in t['methods'])
    modules = []
    diagnostics = {'image_base': hex(pe.base), 'expected_max_token': max_token, 'name_positions': [], 'references': [], 'sections': pe.sections}
    start = 0
    while True:
        pos = blob.find(expected.encode()+b'\0', start)
        if pos < 0:
            break
        start = pos+1
        diagnostics['name_positions'].append(pos)
        try:
            needle = struct.pack('<Q', pe.raw_to_va(pos))
        except ValueError:
            continue
        ref = 0
        while True:
            ref = blob.find(needle, ref)
            if ref < 0:
                break
            try:
                name, count, pointers = struct.unpack_from('<3Q', blob, ref)
                diagnostics['references'].append({'raw': ref, 'count': count, 'pointers': hex(pointers)})
                if max_token <= count < 200000:
                    raw = pe.va_to_raw(pointers)
                    if raw+count*8 <= len(blob):
                        tests = [struct.unpack_from('<Q', blob, raw+j*8)[0] for j in (0, count//3, count//2, count-1)]
                        if all(p == 0 or pe.executable(p) for p in tests):
                            modules.append({'raw': ref, 'count': count, 'pointer_raw': raw})
            except (ValueError, struct.error):
                pass
            ref += 1
    if len(modules) != 1:
        (output/'mapping-diagnostics.json').write_text(json.dumps(diagnostics, indent=2)+'\n', encoding='utf-8')
        raise ValueError(f'Expected unique validated codegen module, found {modules}')
    module = modules[0]
    # Explicitly bounded research targets; no arbitrary binary-wide code export.
    wanted = {'FallBoardLayout', 'TuberBoardNodeLayout', 'AnvilFox', 'AmbushFox', 'ArmorersBird', 'Battle', 'ChooseAmbushCards', 'FieldHospitalResolution'}
    methods = []
    selected = [t for t in types if t['name'] in wanted]
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
    lookup = {}
    for t in types:
        for m in t['methods']:
            token = int(m['token'], 16) & 0xffffff
            va = struct.unpack_from('<Q', blob, module['pointer_raw']+(token-1)*8)[0]
            if va:
                lookup.setdefault(va, []).append(t['name']+'.'+m['name'])
    for t in selected:
        for m in t['methods']:
            token = int(m['token'], 16) & 0xffffff
            va = struct.unpack_from('<Q', blob, module['pointer_raw']+(token-1)*8)[0]
            if not va or not pe.executable(va):
                continue
            raw = pe.va_to_raw(va)
            end = pe.function_end(va)
            # Unknown function lengths are not guessed.
            item = {'type': t['name'], 'namespace': t['namespace'], 'method': m['name'], 'token': m['token'], 'va': hex(va), 'rva': hex(va-pe.base), 'raw': raw, 'bytes': end-va if end else None}
            if end and end-va <= 65536:
                rows = []
                for inst in md.disasm(blob[raw:raw+end-va], va):
                    annotation = ''
                    if inst.mnemonic in ('call', 'jmp'):
                        try:
                            target = int(inst.op_str, 16)
                            annotation = ' ; '+', '.join(lookup[target][:3]) if target in lookup else ''
                        except ValueError:
                            pass
                    rows.append(f'{inst.address:016x}  {inst.mnemonic:8} {inst.op_str}{annotation}')
                filename = f'{t["name"]}-{m["index"]}.asm.txt'
                (output/filename).write_text('\n'.join(rows)+'\n', encoding='utf-8')
                item['disassembly'] = filename
            methods.append(item)
    report = {'source': 'GameAssembly.dll', 'sha256': hashlib.sha256(blob).hexdigest(), 'image_base': hex(pe.base), 'module': module, 'mapping_reference': 'https://github.com/SamboyCoding/Cpp2IL/blob/development/LibCpp2IL/BinaryStructures/Il2CppCodeGenModule.cs', 'capstone_version': capstone.__version__, 'methods': methods, 'limits': ['Static address mapping and disassembly only; methods were not executed.', 'Disassembly is not reconstructed C# and does not prove full control-flow semantics.']}
    (output/'native-index.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'module_count': 1, 'method_pointer_count': module['count'], 'selected_types': len(selected), 'selected_methods': len(methods), 'methods': [{k: v for k, v in m.items() if k in ('type','method','bytes','disassembly')} for m in methods]}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('game', type=Path)
    p.add_argument('--index', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    run(a.game, a.index, a.output)
