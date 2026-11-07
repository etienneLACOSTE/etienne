"""Validation of /get_move requests, kept free of torch/chess so it is cheap to test."""

ELO_MIN, ELO_MAX = 400, 3000
FEN_MAX_LENGTH = 100
CARD_COUNT = 20
MAX_SPELL_CHARGES = 3
MAX_SQUARES = 64


class InvalidRequest(ValueError):
    """The request body is not a valid /get_move payload."""


def _square(item, extra_keys=()):
    if not isinstance(item, dict):
        raise InvalidRequest('square must be an object')
    r, c = item.get('r'), item.get('c')
    if not (isinstance(r, int) and isinstance(c, int) and not isinstance(r, bool) and not isinstance(c, bool)
            and 0 <= r < 8 and 0 <= c < 8):
        raise InvalidRequest('square out of range')
    clean = {'r': r, 'c': c}
    for key in extra_keys:
        clean[key] = item.get(key)
    return clean


def _squares(value, name, extra_keys=()):
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > MAX_SQUARES:
        raise InvalidRequest(f'{name} must be a list of squares')
    return [_square(item, extra_keys) for item in value]


def _spells(value, name):
    if value is None:
        return {}
    if not isinstance(value, dict) or len(value) > CARD_COUNT:
        raise InvalidRequest(f'{name} must map card ids to charges')
    clean = {}
    for key, charges in value.items():
        try:
            card = int(key)
        except (TypeError, ValueError):
            raise InvalidRequest(f'{name}: bad card id') from None
        if not 1 <= card <= CARD_COUNT or not isinstance(charges, int) or isinstance(charges, bool) \
                or not 0 <= charges <= MAX_SPELL_CHARGES:
            raise InvalidRequest(f'{name}: bad card or charge count')
        clean[card] = charges
    return clean


def validate_get_move_payload(data):
    """Return a cleaned copy of the payload, or raise InvalidRequest."""
    if not isinstance(data, dict):
        raise InvalidRequest('JSON object expected')

    fen = data.get('fen')
    if not isinstance(fen, str) or not 0 < len(fen) <= FEN_MAX_LENGTH:
        raise InvalidRequest('fen must be a short string')

    elo = data.get('elo', 1500)
    if isinstance(elo, bool) or not isinstance(elo, (int, float)):
        raise InvalidRequest('elo must be a number')
    elo = int(min(ELO_MAX, max(ELO_MIN, elo)))

    last = data.get('last_played_spell')
    if last is not None:
        if isinstance(last, bool) or not isinstance(last, int) or not 1 <= last <= CARD_COUNT:
            raise InvalidRequest('last_played_spell must be a card id')

    traps = _squares(data.get('traps'), 'traps', extra_keys=('owner',))
    if any(t['owner'] not in ('white', 'black') for t in traps):
        raise InvalidRequest('trap owner must be white or black')

    clean = {
        'fen': fen,
        'elo': elo,
        'white_spells': _spells(data.get('white_spells'), 'white_spells'),
        'black_spells': _spells(data.get('black_spells'), 'black_spells'),
        'walls': _squares(data.get('walls'), 'walls'),
        'traps': traps,
        'frozen': _squares(data.get('frozen'), 'frozen'),
        'shielded': _squares(data.get('shielded'), 'shielded'),
        'last_played_spell': last,
    }
    for flag in ('ghost_active', 'leap_frog_active', 'cannibalism_active', 'assassin_active', 'promotion_active'):
        clean[flag] = bool(data.get(flag))
    return clean
