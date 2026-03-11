import countryPhoneCatalog from "./countryPhoneCatalog.json";

export type CountryPhoneCatalogEntry = {
  iso2: string;
  countryName: string;
  dialCode: string;
  population: number;
};

export type CountryPhoneOption = {
  iso2: string;
  countryName: string;
  displayName: string;
  dialCode: string;
};

export const COUNTRY_PHONE_CATALOG = countryPhoneCatalog as CountryPhoneCatalogEntry[];

export const MIN_PHONE_COUNTRY_POPULATION = 1_000_000;

const COUNTRY_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  AE: "UAE",
  CD: "Congo",
};

export const PREFERRED_ISO_BY_DIAL_CODE: Record<string, string> = {
  "+1": "US",
  "+7": "RU",
};

export const COUNTRY_PHONE_OPTIONS: CountryPhoneOption[] = COUNTRY_PHONE_CATALOG
  .filter((entry) => entry.population >= MIN_PHONE_COUNTRY_POPULATION)
  .map(({ iso2, countryName, dialCode }) => ({
    iso2,
    countryName,
    displayName: COUNTRY_DISPLAY_NAME_OVERRIDES[iso2] ?? countryName,
    dialCode,
  }))
  .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.iso2.localeCompare(b.iso2));

export const PHONE_OPTION_BY_ISO = new Map(COUNTRY_PHONE_OPTIONS.map((option) => [option.iso2, option]));

const optionsByDialCode = COUNTRY_PHONE_OPTIONS.reduce<Record<string, CountryPhoneOption[]>>((acc, option) => {
  acc[option.dialCode] = acc[option.dialCode] ?? [];
  acc[option.dialCode].push(option);
  return acc;
}, {});

export const CANONICAL_ISO_BY_DIAL_CODE = Object.entries(optionsByDialCode).reduce<Record<string, string>>((acc, [dialCode, options]) => {
  const preferredIso = PREFERRED_ISO_BY_DIAL_CODE[dialCode];
  if (preferredIso && options.some((option) => option.iso2 === preferredIso)) {
    acc[dialCode] = preferredIso;
    return acc;
  }

  acc[dialCode] = options
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.iso2.localeCompare(b.iso2))[0]
    .iso2;

  return acc;
}, {});

export const DIALED_PREFIXES = Object.keys(CANONICAL_ISO_BY_DIAL_CODE).sort((a, b) => b.length - a.length);

export const sanitizePhoneText = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return hasLeadingPlus ? "+" : "";
  }

  return `${hasLeadingPlus ? "+" : ""}${digits}`;
};

export const inferIsoFromPhoneText = (phoneText: string): string | null => {
  const normalized = sanitizePhoneText(phoneText);
  if (!normalized.startsWith("+")) {
    return null;
  }

  const matchedDialCode = DIALED_PREFIXES.find((dialCode) => normalized.startsWith(dialCode));
  if (!matchedDialCode) {
    return null;
  }

  return CANONICAL_ISO_BY_DIAL_CODE[matchedDialCode] ?? null;
};

export const replaceDialCodeInPhoneText = (phoneText: string, nextDialCode: string): string => {
  const normalized = sanitizePhoneText(phoneText);

  if (!normalized) {
    return nextDialCode;
  }

  if (!normalized.startsWith("+")) {
    const digits = normalized.replace(/\D/g, "");
    return `${nextDialCode}${digits}`;
  }

  const currentDialCode = DIALED_PREFIXES.find((dialCode) => normalized.startsWith(dialCode));
  if (!currentDialCode) {
    return nextDialCode;
  }

  const tail = normalized.slice(currentDialCode.length);
  return `${nextDialCode}${tail}`;
};
