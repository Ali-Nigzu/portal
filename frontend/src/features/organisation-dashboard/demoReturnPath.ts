export function demoReturnPath(candidate: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(candidate); } catch { return '/'; }
  let checked = decoded;
  for (let i = 0; i < 4; i++) {
    if (!checked.startsWith('/') || checked.startsWith('//') || /[\u0000-\u001F\u007F\\]/u.test(checked)) return '/';
    try {
      const next = decodeURIComponent(checked);
      if (next === checked) return new URL(decoded, 'https://camos.invalid').origin === 'https://camos.invalid' ? decoded : '/';
      checked = next;
    } catch { return '/'; }
  }
  return '/';
}
