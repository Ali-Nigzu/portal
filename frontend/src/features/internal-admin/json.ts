/** JSON numbers retain their original spelling when JS Number would lose precision. */
export class JsonNumber {
  constructor(readonly raw: string) {}
}
export function parseJson(text: string): unknown {
  let i = 0;
  const space = () => {
    while (/[ \t\r\n]/.test(text[i] ?? "") && i < text.length) i++;
  };
  const value = (depth = 0): unknown => {
    if (depth > 100) throw Error("JSON nesting is too deep");
    space();
    const start = i;
    if (text[i] === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i++] === '"') return JSON.parse(text.slice(start, i));
      }
      throw Error("Unterminated JSON string");
    }
    if (text[i] === "[" || text[i] === "{") {
      const object = text[i++] === "{";
      const end = object ? "}" : "]";
      const list: unknown[] = [];
      const map: Record<string, unknown> = Object.create(null);
      space();
      if (text[i] === end) {
        i++;
        return object ? map : list;
      }
      while (i < text.length) {
        if (object) {
          space();
          if (text[i] !== '"') throw Error("JSON object keys must be strings");
          const key = value(depth + 1) as string;
          if (Object.prototype.hasOwnProperty.call(map, key))
            throw Error(`Duplicate JSON key: ${key}`);
          space();
          if (text[i++] !== ":") throw Error("Expected colon");
          map[key] = value(depth + 1);
        } else list.push(value(depth + 1));
        space();
        if (text[i] === end) {
          i++;
          return object ? map : list;
        }
        if (text[i++] !== ",") throw Error("Expected comma");
      }
      throw Error("Unterminated JSON collection");
    }
    for (const [word, result] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return result;
      }
    }
    const match = text
      .slice(i)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw Error("Invalid JSON value");
    i += match[0].length;
    const n = Number(match[0]);
    return Number.isSafeInteger(n) && !/[.eE]/.test(match[0])
      ? n
      : new JsonNumber(match[0]);
  };
  const result = value();
  space();
  if (i !== text.length) throw Error("Unexpected JSON content");
  return result;
}
export function stringifyJson(value: unknown, pretty = false): string {
  const encode = (v: unknown, depth: number): string => {
    if (v instanceof JsonNumber) return v.raw;
    if (v === null || typeof v !== "object") {
      const text = JSON.stringify(v);
      if (text === undefined) throw Error("Invalid JSON value");
      return text;
    }
    const array = Array.isArray(v);
    const entries = array
      ? v.map((x) => encode(x, depth + 1))
      : Object.entries(v).map(
          ([k, x]) =>
            `${JSON.stringify(k)}:${pretty ? " " : ""}${encode(x, depth + 1)}`,
        );
    const open = array ? "[" : "{";
    const close = array ? "]" : "}";
    if (!entries.length) return open + close;
    return pretty
      ? `${open}\n${"  ".repeat(depth + 1)}${entries.join(",\n" + "  ".repeat(depth + 1))}\n${"  ".repeat(depth)}${close}`
      : open + entries.join(",") + close;
  };
  return encode(value, 0);
}
