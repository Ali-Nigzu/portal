import { COUNTRY_PHONE_OPTIONS } from "./countryPhoneData";

export type PhoneCountryOption = {
  iso2: string;
  countryName: string;
  dialCode: string;
  searchText: string;
};

type RawOption = { iso2: string; dialCode: string };

const ISO_PRIORITY: Record<string, number> = {
  US: 500,
  CA: 450,
  GB: 440,
  IN: 430,
  CN: 420,
  BR: 410,
  AU: 400,
  FR: 390,
  DE: 380,
  JP: 370,
  MX: 360,
  ES: 350,
  IT: 340,
  KR: 330,
  ZA: 320,
  RU: 310,
  ID: 300,
};

const displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

const getCountryName = (iso2: string) => {
  const name = displayNames?.of(iso2.toUpperCase());
  if (!name || name === iso2.toUpperCase()) {
    return iso2.toUpperCase();
  }
  return name;
};

export const normalizeInternationalPhone = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

const dedupePhoneOptions = (rawOptions: RawOption[]): PhoneCountryOption[] => {
  const byDial = new Map<string, RawOption[]>();
  rawOptions.forEach((option) => {
    const iso = option.iso2.toUpperCase();
    const dial = option.dialCode;
    if (!/^\+[1-9]\d*$/.test(dial)) return;
    const list = byDial.get(dial) ?? [];
    list.push({ iso2: iso, dialCode: dial });
    byDial.set(dial, list);
  });

  const finalOptions: PhoneCountryOption[] = [];
  byDial.forEach((entries, dialCode) => {
    if (dialCode === "+1") {
      ["US", "CA"].forEach((iso) => {
        if (entries.some((entry) => entry.iso2 === iso)) {
          const countryName = getCountryName(iso);
          finalOptions.push({ iso2: iso, countryName, dialCode, searchText: `${iso} ${countryName} ${dialCode}`.toLowerCase() });
        }
      });
      return;
    }

    const best = [...entries].sort((a, b) => {
      const priorityDiff = (ISO_PRIORITY[b.iso2] ?? 0) - (ISO_PRIORITY[a.iso2] ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.iso2.localeCompare(b.iso2);
    })[0];

    const countryName = getCountryName(best.iso2);
    finalOptions.push({
      iso2: best.iso2,
      countryName,
      dialCode,
      searchText: `${best.iso2} ${countryName} ${dialCode}`.toLowerCase(),
    });
  });

  return finalOptions.sort((a, b) => a.countryName.localeCompare(b.countryName));
};

export const PHONE_OPTIONS = dedupePhoneOptions(COUNTRY_PHONE_OPTIONS);
export const OPTIONS_BY_ISO = new Map(PHONE_OPTIONS.map((item) => [item.iso2, item]));
const SORTED_DIAL_CODES = Array.from(new Set(PHONE_OPTIONS.map((item) => item.dialCode))).sort((a, b) => b.length - a.length);

export const getPhoneOptionByIso = (iso: string) => OPTIONS_BY_ISO.get(iso.toUpperCase()) ?? null;
export const getDefaultPhoneIso = () => (OPTIONS_BY_ISO.has("GB") ? "GB" : PHONE_OPTIONS[0]?.iso2 ?? "US");

export const matchIsoFromPhone = (phoneValue: string) => {
  const normalized = normalizeInternationalPhone(phoneValue);
  if (!normalized.startsWith("+")) return null;
  const matchedDial = SORTED_DIAL_CODES.find((dial) => normalized.startsWith(dial));
  if (!matchedDial) return null;
  if (matchedDial === "+1") return OPTIONS_BY_ISO.has("US") ? "US" : "CA";
  const match = PHONE_OPTIONS.find((option) => option.dialCode === matchedDial);
  return match?.iso2 ?? null;
};

export const ensurePhoneHasDialCode = (phoneValue: string, iso: string) => {
  const option = getPhoneOptionByIso(iso) ?? getPhoneOptionByIso(getDefaultPhoneIso());
  if (!option) return normalizeInternationalPhone(phoneValue);

  const normalized = normalizeInternationalPhone(phoneValue);
  if (!normalized) return option.dialCode;

  if (!normalized.startsWith("+")) {
    return `${option.dialCode}${normalized.replace(/\D/g, "")}`;
  }

  const existingIso = matchIsoFromPhone(normalized);
  const existingOption = existingIso ? getPhoneOptionByIso(existingIso) : null;
  const suffix = existingOption ? normalized.slice(existingOption.dialCode.length) : normalized.slice(1);
  return `${option.dialCode}${suffix}`;
};
