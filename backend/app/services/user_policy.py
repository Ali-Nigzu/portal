"""Canonical profile-name policy; names carry no authentication authority."""

# Unicode White_Space, shared explicitly with usernameValidation.ts.
WHITESPACE = frozenset(chr(c) for c in (
    *range(0x09, 0x0E), 0x20, 0x85, 0xA0, 0x1680,
    *range(0x2000, 0x200B), 0x2028, 0x2029, 0x202F, 0x205F, 0x3000,
))
USERNAME_MESSAGE = 'Use 3–15 characters with no spaces.'


class InvalidUsername(ValueError):
    pass


def username_value(value):
    if (not isinstance(value, str) or not 3 <= len(value) <= 15
            or any(c in WHITESPACE or ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in value)):
        raise InvalidUsername(USERNAME_MESSAGE)
    return value


def seed_username(name, email):
    def clean(value):
        return ''.join(c for c in value if c not in WHITESPACE and ord(c) >= 32
                       and ord(c) != 127 and not 0xD800 <= ord(c) <= 0xDFFF)[:15]
    value = clean(name or '')
    if len(value) < 3:
        value = clean(email.split('@', 1)[0])
    return username_value(value if len(value) >= 3 else 'user')
