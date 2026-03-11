import React, { useEffect, useMemo, useRef, useState } from "react";

import { COUNTRY_PHONE_OPTIONS } from "../countryPhoneData";
import { filterPhoneCountries } from "../phoneCountrySearch";

type AuthPhoneFieldProps = {
  idPrefix: string;
  countryCode: string;
  localNumber: string;
  onCountryCodeChange: (value: string) => void;
  onLocalNumberChange: (value: string) => void;
  inputClassName?: string;
};

const AuthPhoneField: React.FC<AuthPhoneFieldProps> = ({
  idPrefix,
  countryCode,
  localNumber,
  onCountryCodeChange,
  onLocalNumberChange,
  inputClassName = "vrm-input",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedCountry = useMemo(
    () => COUNTRY_PHONE_OPTIONS.find((option) => option.dialCode === countryCode) ?? COUNTRY_PHONE_OPTIONS[0],
    [countryCode],
  );

  const filteredOptions = useMemo(() => filterPhoneCountries(COUNTRY_PHONE_OPTIONS, query), [query]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!wrapperRef.current || wrapperRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
      setQuery("");
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  const selectOption = (dialCode: string) => {
    onCountryCodeChange(dialCode);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="auth-phone-row">
      <div className="auth-phone-country-picker" ref={wrapperRef}>
        <button
          type="button"
          id={`${idPrefix}-country`}
          className="vrm-input auth-phone-country-trigger"
          onClick={() => setIsOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>{selectedCountry.iso2}</span>
          <span className="auth-phone-country-trigger-dial">{selectedCountry.dialCode}</span>
        </button>

        {isOpen ? (
          <div className="auth-phone-country-popover">
            <input
              className="vrm-input auth-phone-country-search"
              placeholder="Search country or ISO"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const activeOption = filteredOptions[activeIndex];
                  if (activeOption) {
                    selectOption(activeOption.dialCode);
                  }
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setIsOpen(false);
                  setQuery("");
                }
              }}
            />

            <ul className="auth-phone-country-options" role="listbox">
              {filteredOptions.map((option, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={`${option.iso2}-${option.countryName}`}>
                    <button
                      type="button"
                      className={`auth-phone-country-option ${isActive ? "auth-phone-country-option--active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectOption(option.dialCode)}
                    >
                      <span className="auth-phone-country-option-iso">{option.iso2}</span>
                      <span className="auth-phone-country-option-name">{option.countryName}</span>
                      <span className="auth-phone-country-option-dial">{option.dialCode}</span>
                    </button>
                  </li>
                );
              })}
              {filteredOptions.length === 0 ? (
                <li className="auth-phone-country-empty">No matching countries</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      <input
        id={`${idPrefix}-local`}
        className={inputClassName}
        autoComplete="tel"
        inputMode="tel"
        placeholder="Phone number"
        value={localNumber}
        onChange={(event) => onLocalNumberChange(event.target.value.replace(/[^\d]/g, ""))}
      />
    </div>
  );
};

export default AuthPhoneField;
