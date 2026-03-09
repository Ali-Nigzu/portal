import React, { useEffect, useMemo, useRef, useState } from "react";

import { ensurePhoneHasDialCode, getDefaultPhoneIso, getPhoneOptionByIso, PHONE_OPTIONS } from "../phoneUtils";

type AuthPhoneFieldProps = {
  idPrefix: string;
  selectedIso: string;
  phoneValue: string;
  onSelectedIsoChange: (iso: string) => void;
  onPhoneValueChange: (value: string) => void;
  inputClassName?: string;
};

const AuthPhoneField: React.FC<AuthPhoneFieldProps> = ({
  idPrefix,
  selectedIso,
  phoneValue,
  onSelectedIsoChange,
  onPhoneValueChange,
  inputClassName = "vrm-input",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = getPhoneOptionByIso(selectedIso) ?? getPhoneOptionByIso(getDefaultPhoneIso());

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!rootRef.current?.contains(node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return PHONE_OPTIONS;
    return PHONE_OPTIONS.filter((option) => option.searchText.includes(normalizedQuery));
  }, [query]);

  const handleSelect = (iso: string) => {
    onSelectedIsoChange(iso);
    onPhoneValueChange(ensurePhoneHasDialCode(phoneValue, iso));
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="auth-phone-combo" ref={rootRef}>
      <button
        id={`${idPrefix}-country`}
        type="button"
        className={`vrm-input auth-phone-country-select-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{selectedOption?.iso2 ?? getDefaultPhoneIso()}</span>
        <span className="auth-phone-caret" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="auth-phone-dropdown" role="listbox" aria-label="Country code options">
          <input
            ref={searchRef}
            className="vrm-input auth-phone-search"
            placeholder="Search ISO or country"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="auth-phone-options">
            {filteredOptions.map((option) => (
              <button
                key={`${option.iso2}-${option.dialCode}`}
                type="button"
                className={`auth-phone-option ${option.iso2 === selectedIso ? "is-active" : ""}`}
                onClick={() => handleSelect(option.iso2)}
                role="option"
                aria-selected={option.iso2 === selectedIso}
              >
                <span className="auth-phone-option-iso">{option.iso2}</span>
                <span className="auth-phone-option-country">{option.countryName}</span>
                <span className="auth-phone-option-dial">{option.dialCode}</span>
              </button>
            ))}
            {filteredOptions.length === 0 ? <div className="auth-phone-no-results">No matches</div> : null}
          </div>
        </div>
      ) : null}

      <input
        id={`${idPrefix}-phone`}
        className={inputClassName}
        autoComplete="tel"
        inputMode="tel"
        placeholder="+441234567890"
        value={phoneValue}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d+]/g, "");
          onPhoneValueChange(next.startsWith("+") ? next : next.replace(/\+/g, ""));
        }}
      />
    </div>
  );
};

export default AuthPhoneField;
