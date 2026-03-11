import type { CountryPhoneOption } from "./countryPhoneData";

const normalize = (value: string) => value.trim().toLowerCase();

const isDialCodeQuery = (query: string) => /^\+?\d+$/.test(query);

const scoreOption = (option: CountryPhoneOption, query: string): number | null => {
  const iso = option.iso2.toLowerCase();
  const name = option.countryName.toLowerCase();
  const dial = option.dialCode;

  if (iso.startsWith(query)) {
    return 0;
  }

  if (name.startsWith(query)) {
    return 1;
  }

  if (isDialCodeQuery(query)) {
    const normalizedDialQuery = query.startsWith("+") ? query : `+${query}`;
    if (dial.startsWith(normalizedDialQuery)) {
      return 2;
    }
  }

  return null;
};

export const filterPhoneCountries = (options: CountryPhoneOption[], rawQuery: string): CountryPhoneOption[] => {
  const query = normalize(rawQuery);

  if (!query) {
    return options;
  }

  return options
    .map((option) => ({ option, score: scoreOption(option, query) }))
    .filter((entry): entry is { option: CountryPhoneOption; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.option.countryName.localeCompare(b.option.countryName) || a.option.iso2.localeCompare(b.option.iso2);
    })
    .map((entry) => entry.option);
};
