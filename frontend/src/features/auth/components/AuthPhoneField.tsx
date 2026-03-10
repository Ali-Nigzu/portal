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

const MENU_HEIGHT_ESTIMATE = 272;

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
  const [direction, setDirection] = useState<"down" | "up">("down");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  const selectedOption = getPhoneOptionByIso(selectedIso) ?? getPhoneOptionByIso(getDefaultPhoneIso());

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return PHONE_OPTIONS;

    const ranked = PHONE_OPTIONS
      .map((option) => {
        const iso = option.iso2.toLowerCase();
        const country = option.countryName.toLowerCase();
        const search = option.searchText;

        let rank = -1;
        if (iso.startsWith(normalizedQuery) || country.startsWith(normalizedQuery)) {
          rank = 3;
        } else if (search.includes(normalizedQuery)) {
          rank = 2;
        }

        return { option, rank };
      })
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        return a.option.countryName.localeCompare(b.option.countryName);
      });

    return ranked.map((entry) => entry.option);
  }, [query]);

  const recalculateDirection = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const nextDirection = spaceBelow >= MENU_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove ? "down" : "up";
    setDirection(nextDirection);
  };

  useEffect(() => {
    if (!open) return;
    recalculateDirection();

    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDocClick = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!rootRef.current?.contains(node)) {
        setOpen(false);
      }
    };

    window.addEventListener("resize", recalculateDirection);
    window.addEventListener("scroll", recalculateDirection, true);
    document.addEventListener("mousedown", onDocClick);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", recalculateDirection);
      window.removeEventListener("scroll", recalculateDirection, true);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = optionsRef.current;
    const selectedNode = selectedOptionRef.current;
    if (!container || !selectedNode) return;

    const topInset = 12;
    const bottomInset = 12;
    const selectedTop = selectedNode.offsetTop;
    const selectedBottom = selectedTop + selectedNode.offsetHeight;

    const target = direction === "down"
      ? selectedTop - topInset
      : selectedBottom - container.clientHeight + bottomInset;

    const clamped = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
    container.scrollTop = clamped;
  }, [open, direction, filteredOptions, selectedIso]);

  const handleSelect = (iso: string) => {
    onSelectedIsoChange(iso);
    onPhoneValueChange(ensurePhoneHasDialCode(phoneValue, iso));
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="auth-phone-combo" ref={rootRef}>
      <button
        ref={triggerRef}
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
        <div className={`auth-phone-dropdown ${direction}`} role="listbox" aria-label="Country code options">
          <input
            ref={searchRef}
            className="vrm-input auth-phone-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="auth-phone-options" ref={optionsRef}>
            {filteredOptions.map((option) => (
              <button
                key={`${option.iso2}-${option.dialCode}`}
                ref={option.iso2 === selectedIso ? selectedOptionRef : null}
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
