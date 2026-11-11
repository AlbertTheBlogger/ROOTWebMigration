# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import json
from pathlib import Path
import struct
import tempfile
import unittest

from tools.research_baseline import compressed_int, metadata_index
from tools.research_map import recover
from tools.research_native import PE

ROOT = Path(__file__).resolve().parents[1]


class ResearchTests(unittest.TestCase):
    def test_compressed_integer_boundaries_and_invalid_input(self):
        cases = [(b'\0', 0), (b'\x02', 1), (b'\x01', -1), (b'\x7e', 63), (b'\x80\x80', 64), (b'\xc0\x00\x40\x00', 8192), (b'\xff', -2147483648), (b'\xfe', 2147483647), (b'\xf0\x00\x00\x00\x20', 268435456)]
        for data, expected in cases:
            with self.subTest(data=data):
                self.assertEqual(compressed_int(data, 0), (expected, len(data)))
        for data in (b'', b'\x80', b'\xc0\x01', b'\xf0\x01'):
            with self.assertRaises(ValueError): compressed_int(data, 0)

    def fixture(self):
        blob = bytearray(2048)
        struct.pack_into('<II', blob, 0, 0xFAB11BAF, 29)
        for i in range(32): struct.pack_into('<II', blob, 8+i*8, 512, 0)
        strings = b'\0Sample\0tuber.sample\0tuber-canis.dll\0Run\0arg\0field\0'
        blob[512:512+len(strings)] = strings
        def si(name): return strings.index(name.encode()+b'\0')
        sections = {2:(512,len(strings)), 5:(1100,32), 10:(1150,12), 11:(1180,12), 19:(1200,88), 20:(1320,40)}
        for i,(offset,size) in sections.items(): struct.pack_into('<II',blob,8+i*8,offset,size)
        struct.pack_into('<6I4H',blob,1100,si('Run'),0,0,0,0xffffffff,0x06000001,0,0,0,1)
        struct.pack_into('<3I',blob,1150,si('arg'),0x08000001,0)
        struct.pack_into('<3I',blob,1180,si('field'),0,0x04000001)
        ints = [0]*16
        ints[0],ints[1]=si('Sample'),si('tuber.sample')
        struct.pack_into('<16I8H2I',blob,1200,*ints,1,0,1,0,0,0,0,0,0,0x02000001)
        struct.pack_into('<10I',blob,1320,si('tuber-canis.dll'),0,0,1,0,0,0,0x20000001,0,0)
        return blob

    def parse(self, blob):
        with tempfile.TemporaryDirectory(prefix='root-metadata-test-') as temp:
            path=Path(temp)/'metadata.dat'
            path.write_bytes(blob)
            return metadata_index(path)

    def test_metadata_indices_and_parameter_names(self):
        index = self.parse(self.fixture())
        self.assertEqual(index['type_count'],1)
        self.assertEqual(index['method_count'],1)
        self.assertEqual(index['candidate_types'][0]['methods'][0]['parameters'],['arg'])

    def test_metadata_rejects_corrupt_bounds_owner_and_version(self):
        b=self.fixture();struct.pack_into('<I',b,4,31)
        with self.assertRaises(ValueError): self.parse(b)
        b=self.fixture();struct.pack_into('<II',b,8+19*8,2000,88)
        with self.assertRaises(ValueError): self.parse(b)
        b=self.fixture();struct.pack_into('<I',b,1104,99)
        with self.assertRaises(ValueError): self.parse(b)
        b=self.fixture();struct.pack_into('<I',b,1100,999999)
        with self.assertRaises(ValueError): self.parse(b)

    def test_pe_maps_il2cpp_executable_section_without_name_assumption(self):
        b=bytearray(1024);b[:2]=b'MZ';struct.pack_into('<I',b,0x3c,64);b[64:68]=b'PE\0\0'
        struct.pack_into('<H',b,70,1);struct.pack_into('<H',b,84,240);struct.pack_into('<H',b,88,0x20b);struct.pack_into('<Q',b,112,0x180000000)
        p=328;b[p:p+8]=b'il2cpp\0\0';struct.pack_into('<4I',b,p+8,128,0x1000,128,512);struct.pack_into('<I',b,p+36,0x60000020)
        pe=PE(bytes(b))
        self.assertTrue(pe.executable(0x180001010))
        self.assertEqual(pe.va_to_raw(0x180001010),528)
        self.assertEqual(pe.raw_to_va(528),0x180001010)
        with self.assertRaises(ValueError):pe.va_to_raw(0x180001100)

    def test_real_static_map_snapshot_is_connected_and_complete(self):
        path=ROOT/'research/native/FallBoardLayout-4141.asm.txt'
        self.assertTrue(path.exists(), 'Research fixture must be generated first')
        result=recover(path.read_text(encoding='utf-8').splitlines())
        self.assertEqual(len(result['nodes']),19)
        self.assertEqual(result['opposite_corners'],{0:8,8:0,2:11,11:2})
        self.assertEqual([n['id'] for n in result['nodes'] if n.get('ruin')],[3,5,6,7])

    def test_map_scanner_rejects_unresolved_or_asymmetric_changes(self):
        text=(ROOT/'research/native/FallBoardLayout-4141.asm.txt').read_text(encoding='utf-8')
        broken=text.replace('mov      dword ptr [rdx + rcx*4 + 0x20], 1','mov      dword ptr [rdx + rcx*4 + 0x20], 7',1)
        with self.assertRaises(ValueError):recover(broken.splitlines())
        broken=text.replace('mov      dword ptr [rdx + rcx*4 + 0x20], 1','mov      dword ptr [rdx + rcx*4 + 0x20], unknown_register',1)
        with self.assertRaises(ValueError):recover(broken.splitlines())

    def test_card_samples_link_verified_counts_and_preserve_uncraftable_ambush(self):
        cards=json.loads((ROOT/'research/samples/card-samples.json').read_text(encoding='utf-8'))
        self.assertEqual({c['type'] for c in cards},{'AnvilFox','AmbushFox','ArmorersBird'})
        for card in cards:
            self.assertEqual(card['copy_count'],2 if card['type']=='ArmorersBird' else 1)
            if card['type']=='AmbushFox':
                self.assertIsNone(card['crafting_cost'])
                self.assertFalse(card['crafting_applicable'])
            else:
                self.assertEqual(card['crafting_cost'],['fox'])
            self.assertTrue(card['localization']['en_US']['entries'])
            self.assertTrue(card['localization']['zh_CN']['entries'])


if __name__ == '__main__':
    unittest.main()
