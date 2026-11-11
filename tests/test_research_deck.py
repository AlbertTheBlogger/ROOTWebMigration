# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from research_deck import extract_decks
from research_card_catalog import item_recipe
from research_full_cards import recover_cost


class DeckResearchTests(unittest.TestCase):
    def test_full_crafting_arrays_and_missing_field_data_rejected(self):
        catalog=json.loads((ROOT/'backend/data/full-card-catalog.json').read_text(encoding='utf8'))
        for card in catalog['cards']:
            if card['kind']=='ambush': continue
            report=json.loads((ROOT/f'research/deck/{card["type"]}-ctor.json').read_text(encoding='utf8'))
            self.assertEqual(recover_cost(report)['cost'],card['cost'])
        report=json.loads((ROOT/'research/deck/RoyalClaimBird-ctor.json').read_text(encoding='utf8'))
        self.assertEqual(recover_cost(report)['cost'],['wild']*4)
        for row in report['instructions']:
            row['references']=[r for r in row['references'] if r['kind']!='field_data']
        with self.assertRaises(ValueError): recover_cost(report)

    def test_original_lists_and_card_counts(self):
        metadata=json.loads((ROOT/'research/baseline/metadata-index.json').read_text(encoding='utf8'))
        report=json.loads((ROOT/'research/deck/StandardDecks-cctor.json').read_text(encoding='utf8'))
        result=extract_decks(report,metadata['candidate_types'])
        self.assertEqual(len(result['decks']),16)
        self.assertEqual(len(result['decks']['DrawDeck']),50)
        self.assertEqual(result['counts']['DrawDeck']['AnvilFox'],1)
        self.assertEqual(result['counts']['DrawDeck']['ArmorersBird'],2)
        self.assertEqual(result['counts']['DrawDeck']['AmbushFox'],1)
        self.assertEqual(result['counts']['DrawDeck']['AmbushBird'],2)
        self.assertEqual(len(result['decks']['DominanceCards']),4)
        broken=copy.deepcopy(report)
        broken['instructions']=[i for i in broken['instructions'] if i['operands']!='qword ptr [rcx + 0x78], rbx']
        with self.assertRaises(ValueError):
            extract_decks(broken,metadata['candidate_types'])

    def test_native_item_costs_and_rejected_unknown_writes(self):
        report=json.loads((ROOT/'research/deck/AnvilFox-ctor.json').read_text(encoding='utf8'))
        self.assertEqual(item_recipe(report)['cost'],['fox'])
        self.assertEqual(item_recipe(report)['points'],2)
        coin=json.loads((ROOT/'research/deck/BakeSaleRabbit-ctor.json').read_text(encoding='utf8'))
        self.assertEqual(item_recipe(coin)['cost'],['rabbit','rabbit'])
        self.assertEqual(item_recipe(coin)['points'],3)
        broken=copy.deepcopy(report)
        write=next(i for i in broken['instructions'] if i['operands']=='dword ptr [rax + 0x20], 1')
        write['operands']='dword ptr [rax + 0x20], 9'
        with self.assertRaises(ValueError): item_recipe(broken)


if __name__=='__main__':
    unittest.main()
