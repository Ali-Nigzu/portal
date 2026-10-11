import countryPhoneCatalog from "./countryPhoneCatalog.json";

type CountryPhoneCatalogEntry = {
  iso2: string;
  countryName: string;
  dialCode: string;
  population: number;
};

type CountryPhoneOption = {
  iso2: string;
  countryName: string;
  displayName: string;
  dialCode: string;
};

const COUNTRY_PHONE_CATALOG = countryPhoneCatalog as CountryPhoneCatalogEntry[];

const MIN_PHONE_COUNTRY_POPULATION = 1_000_000;

const COUNTRY_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  AE: "UAE",
  CD: "Congo",
};

const PREFERRED_ISO_BY_DIAL_CODE: Record<string, string> = {
  "+1": "US",
  "+7": "RU",
};

export const COUNTRY_PHONE_OPTIONS: CountryPhoneOption[] =
  COUNTRY_PHONE_CATALOG.filter(
    (entry) => entry.population >= MIN_PHONE_COUNTRY_POPULATION,
  )
    .map(({ iso2, countryName, dialCode }) => ({
      iso2,
      countryName,
      displayName: COUNTRY_DISPLAY_NAME_OVERRIDES[iso2] ?? countryName,
      dialCode,
    }))
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        a.iso2.localeCompare(b.iso2),
    );

export const PHONE_OPTION_BY_ISO = new Map(
  COUNTRY_PHONE_OPTIONS.map((option) => [option.iso2, option]),
);

const optionsByDialCode = COUNTRY_PHONE_OPTIONS.reduce<
  Record<string, CountryPhoneOption[]>
>((acc, option) => {
  acc[option.dialCode] = acc[option.dialCode] ?? [];
  acc[option.dialCode].push(option);
  return acc;
}, {});

const CANONICAL_ISO_BY_DIAL_CODE = Object.entries(optionsByDialCode).reduce<
  Record<string, string>
>((acc, [dialCode, options]) => {
  const preferredIso = PREFERRED_ISO_BY_DIAL_CODE[dialCode];
  if (preferredIso && options.some((option) => option.iso2 === preferredIso)) {
    acc[dialCode] = preferredIso;
    return acc;
  }

  acc[dialCode] = options
    .slice()
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        a.iso2.localeCompare(b.iso2),
    )[0].iso2;

  return acc;
}, {});

const DIALED_PREFIXES = Object.keys(CANONICAL_ISO_BY_DIAL_CODE).sort(
  (a, b) => b.length - a.length,
);

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

  const matchedDialCode = DIALED_PREFIXES.find((dialCode) =>
    normalized.startsWith(dialCode),
  );
  if (!matchedDialCode) {
    return null;
  }

  return CANONICAL_ISO_BY_DIAL_CODE[matchedDialCode] ?? null;
};

export const replaceDialCodeInPhoneText = (
  phoneText: string,
  nextDialCode: string,
): string => {
  const normalized = sanitizePhoneText(phoneText);

  if (!normalized) {
    return nextDialCode;
  }

  if (!normalized.startsWith("+")) {
    const digits = normalized.replace(/\D/g, "");
    return `${nextDialCode}${digits}`;
  }

  const currentDialCode = DIALED_PREFIXES.find((dialCode) =>
    normalized.startsWith(dialCode),
  );
  if (!currentDialCode) {
    return nextDialCode;
  }

  const tail = normalized.slice(currentDialCode.length);
  return `${nextDialCode}${tail}`;
};

type OptionalPhoneClassification = {
  normalized: string;
  effectivePhone: string;
  isEffectivelyEmpty: boolean;
  hasSubscriberInput: boolean;
  selectedDialCode: string | null;
};

export const classifyOptionalPhoneInput = (
  phoneText: string,
  selectedIso: string,
): OptionalPhoneClassification => {
  const normalized = sanitizePhoneText(phoneText);
  const selectedDialCode =
    PHONE_OPTION_BY_ISO.get(selectedIso)?.dialCode ?? null;

  if (!normalized || normalized === "+") {
    return {
      normalized,
      effectivePhone: "",
      isEffectivelyEmpty: true,
      hasSubscriberInput: false,
      selectedDialCode,
    };
  }

  if (selectedDialCode && normalized.startsWith(selectedDialCode)) {
    const subscriberTail = normalized.slice(selectedDialCode.length);
    const hasSubscriberInput = /\d/.test(subscriberTail);
    return {
      normalized,
      effectivePhone: hasSubscriberInput ? normalized : "",
      isEffectivelyEmpty: !hasSubscriberInput,
      hasSubscriberInput,
      selectedDialCode,
    };
  }

  return {
    normalized,
    effectivePhone: normalized,
    isEffectivelyEmpty: false,
    hasSubscriberInput: true,
    selectedDialCode,
  };
};

const normalize = (value: string) => value.trim().toLowerCase();

const isDialCodeQuery = (query: string) => /^\+?\d+$/.test(query);

const startsWithAnyName = (option: CountryPhoneOption, query: string) => {
  const names = [option.displayName, option.countryName];
  return names.some((name) => name.toLowerCase().startsWith(query));
};

const scoreOption = (
  option: CountryPhoneOption,
  query: string,
): number | null => {
  const iso = option.iso2.toLowerCase();
  const dial = option.dialCode;

  if (iso.startsWith(query)) {
    return 0;
  }

  if (startsWithAnyName(option, query)) {
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

export const filterPhoneCountries = (
  options: CountryPhoneOption[],
  rawQuery: string,
): CountryPhoneOption[] => {
  const query = normalize(rawQuery);

  if (!query) {
    return options;
  }

  return options
    .map((option) => ({ option, score: scoreOption(option, query) }))
    .filter(
      (entry): entry is { option: CountryPhoneOption; score: number } =>
        entry.score !== null,
    )
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return (
        a.option.displayName.localeCompare(b.option.displayName) ||
        a.option.iso2.localeCompare(b.option.iso2)
      );
    })
    .map((entry) => entry.option);
};
