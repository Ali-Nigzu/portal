export const USERNAME_MESSAGE = "Use 3–15 characters with no spaces.";
const whitespace = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u;
export function usernameError(value: string): string | undefined {
  const characters = Array.from(value);
  return characters.length < 3 || characters.length > 15 || whitespace.test(value)
    || characters.some(c => c.codePointAt(0)! < 32 || (c.length === 1 && /[\uD800-\uDFFF]/u.test(c)))
    ? USERNAME_MESSAGE : undefined;
}
