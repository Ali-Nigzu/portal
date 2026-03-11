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
  dialCode: string;
};

export const COUNTRY_PHONE_CATALOG = countryPhoneCatalog as CountryPhoneCatalogEntry[];

export const MIN_PHONE_COUNTRY_POPULATION = 1_000_000;

export const COUNTRY_PHONE_OPTIONS: CountryPhoneOption[] = COUNTRY_PHONE_CATALOG
  .filter((entry) => entry.population >= MIN_PHONE_COUNTRY_POPULATION)
  .map(({ iso2, countryName, dialCode }) => ({
    iso2,
    countryName,
    dialCode,
  }))
  .sort((a, b) => a.countryName.localeCompare(b.countryName) || a.iso2.localeCompare(b.iso2));
