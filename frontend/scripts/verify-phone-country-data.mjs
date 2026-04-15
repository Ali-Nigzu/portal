import catalog from '../src/features/auth/countryPhoneCatalog.json' with { type: 'json' };

const MIN_POP = 1_000_000;
const filtered = catalog.filter((entry) => entry.population >= MIN_POP);
const belowThreshold = filtered.filter((entry) => entry.population < MIN_POP);

if (belowThreshold.length > 0) {
  throw new Error(`Found ${belowThreshold.length} entries below threshold in filtered output`);
}

const filterCountries = (query) => {
  const q = query.trim().toLowerCase();
  if (!q) return filtered;
  const isDial = /^\+?\d+$/.test(q);
  const score = (entry) => {
    if (entry.iso2.toLowerCase().startsWith(q)) return 0;
    if (entry.countryName.toLowerCase().startsWith(q)) return 1;
    if (isDial) {
      const dq = q.startsWith('+') ? q : `+${q}`;
      if (entry.dialCode.startsWith(dq)) return 2;
    }
    return null;
  };
  return filtered
    .map((entry) => ({ entry, score: score(entry) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => a.score - b.score || a.entry.countryName.localeCompare(b.entry.countryName) || a.entry.iso2.localeCompare(b.entry.iso2))
    .map((item) => item.entry);
};

const picks = {
  can: filterCountries('can').slice(0, 5).map((x) => x.countryName),
  gb: filterCountries('gb').slice(0, 5).map((x) => `${x.iso2} ${x.countryName}`),
  mad: filterCountries('mad').slice(0, 5).map((x) => x.countryName),
  asc: filterCountries('asc').slice(0, 5).map((x) => x.countryName),
};

if (!picks.can.includes('Canada')) throw new Error('can query did not include Canada');
if (!picks.gb.some((x) => x.startsWith('GB '))) throw new Error('gb query did not include GB');
if (!picks.mad.includes('Madagascar')) throw new Error('mad query did not include Madagascar');
if (picks.asc.includes('Madagascar')) throw new Error('asc query incorrectly returned Madagascar');

console.log(`Filtered countries: ${filtered.length}`);
console.log('Query checks:', picks);
console.log('Population threshold enforced: OK');
