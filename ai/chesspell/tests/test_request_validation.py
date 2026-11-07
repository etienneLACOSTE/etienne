"""Tests for request_validation (stdlib only: python3 -m unittest discover -s ai/chesspell/tests)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from request_validation import InvalidRequest, validate_get_move_payload  # noqa: E402

START = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1'


class ValidateGetMovePayload(unittest.TestCase):
    def test_payload_sent_by_the_game_is_accepted(self):
        payload = {
            'fen': START, 'elo': 1500,
            'white_spells': {'8': 1, '12': 1}, 'black_spells': {'15': 1},
            'walls': [{'r': 3, 'c': 3}], 'traps': [{'r': 4, 'c': 4, 'owner': 'black'}],
            'frozen': [{'r': 6, 'c': 0, 'duration': 1}], 'shielded': [],
            'last_played_spell': 8, 'ghost_active': False, 'leap_frog_active': True,
            'cannibalism_active': None, 'assassin_active': False, 'promotion_active': False,
        }
        clean = validate_get_move_payload(payload)
        self.assertEqual(clean['white_spells'], {8: 1, 12: 1})
        self.assertEqual(clean['frozen'], [{'r': 6, 'c': 0}])
        self.assertEqual(clean['traps'], [{'r': 4, 'c': 4, 'owner': 'black'}])
        self.assertIs(clean['leap_frog_active'], True)
        self.assertIs(clean['cannibalism_active'], False)

    def test_defaults_when_optional_fields_are_missing(self):
        clean = validate_get_move_payload({'fen': START})
        self.assertEqual(clean['elo'], 1500)
        self.assertEqual(clean['walls'], [])
        self.assertEqual(clean['white_spells'], {})
        self.assertIsNone(clean['last_played_spell'])

    def test_elo_is_clamped(self):
        self.assertEqual(validate_get_move_payload({'fen': START, 'elo': 10**9})['elo'], 3000)
        self.assertEqual(validate_get_move_payload({'fen': START, 'elo': -5})['elo'], 400)

    def test_invalid_payloads_are_rejected(self):
        bad = [
            None, [], 'x',
            {},  # no fen
            {'fen': 'x' * 500},
            {'fen': START, 'elo': 'strong'},
            {'fen': START, 'elo': True},
            {'fen': START, 'walls': [{'r': 9, 'c': 0}]},
            {'fen': START, 'walls': 'everywhere'},
            {'fen': START, 'walls': [{'r': 0, 'c': 0}] * 65},
            {'fen': START, 'traps': [{'r': 0, 'c': 0, 'owner': 'nobody'}]},
            {'fen': START, 'white_spells': {'99': 1}},
            {'fen': START, 'white_spells': {'abc': 1}},
            {'fen': START, 'black_spells': {'8': 1000}},
            {'fen': START, 'last_played_spell': '8'},
        ]
        for payload in bad:
            with self.subTest(payload=payload):
                with self.assertRaises(InvalidRequest):
                    validate_get_move_payload(payload)


if __name__ == '__main__':
    unittest.main()
