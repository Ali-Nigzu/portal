import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  COUNTRY_PHONE_OPTIONS,
  PHONE_OPTION_BY_ISO,
  inferIsoFromPhoneText,
  replaceDialCodeInPhoneText,
  sanitizePhoneText,
} from "../countryPhoneData";
import { filterPhoneCountries } from "../phoneCountrySearch";

type AuthPhoneFieldProps = {
  idPrefix: string;
  selectedIso: string;
  phoneText: string;
  onSelectedIsoChange: (value: string) => void;
  onPhoneTextChange: (value: string) => void;
  inputClassName?: string;
};

type PopoverPlacement = "up" | "down";

const DEFAULT_POPOVER_WIDTH = 240;
const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;
const ESTIMATED_POPOVER_HEIGHT = 320;

const AuthPhoneField: React.FC<AuthPhoneFieldProps> = ({
  idPrefix,
  selectedIso,
  phoneText,
  onSelectedIsoChange,
  onPhoneTextChange,
  inputClassName = "vrm-input",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<PopoverPlacement>("down");
  const [popoverStyle, setPopoverStyle] = useState<{ left: number; top: number; width: number }>({
    left: 0,
    top: 0,
    width: DEFAULT_POPOVER_WIDTH,
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const selectedCountry = useMemo(
    () => PHONE_OPTION_BY_ISO.get(selectedIso) ?? COUNTRY_PHONE_OPTIONS[0],
    [selectedIso],
  );

  const filteredOptions = useMemo(() => filterPhoneCountries(COUNTRY_PHONE_OPTIONS, query), [query]);

  useEffect(() => {
    const inferredIso = inferIsoFromPhoneText(phoneText);
    if (!inferredIso || inferredIso === selectedIso) {
      return;
    }
    onSelectedIsoChange(inferredIso);
  }, [phoneText, selectedIso, onSelectedIsoChange]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!isOpen) {
        return;
      }

      const targetNode = event.target as Node;
      if (wrapperRef.current?.contains(targetNode) || popoverRef.current?.contains(targetNode)) {
        return;
      }

      setIsOpen(false);
      setQuery("");
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (query.trim()) {
      setActiveIndex(0);
      return;
    }
    const selectedIndex = filteredOptions.findIndex((option) => option.iso2 === selectedCountry.iso2);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, isOpen, query, selectedCountry.iso2]);

  const updatePopoverPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const popoverHeight = popoverRef.current?.offsetHeight ?? ESTIMATED_POPOVER_HEIGHT;
    const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;
    const openUp = spaceBelow < Math.min(popoverHeight, ESTIMATED_POPOVER_HEIGHT) && spaceAbove > spaceBelow;

    const desiredWidth = Math.max(Math.round(triggerRect.width + 120), DEFAULT_POPOVER_WIDTH);
    const clampedWidth = Math.min(desiredWidth, viewportWidth - (VIEWPORT_MARGIN * 2));
    const maxLeft = viewportWidth - clampedWidth - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(triggerRect.left, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN));

    const top = openUp
      ? Math.max(VIEWPORT_MARGIN, triggerRect.top - popoverHeight - POPOVER_GAP)
      : Math.min(viewportHeight - VIEWPORT_MARGIN - popoverHeight, triggerRect.bottom + POPOVER_GAP);

    setPlacement(openUp ? "up" : "down");
    setPopoverStyle({ left, top, width: clampedWidth });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopoverPosition();

    const onReposition = () => updatePopoverPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, query]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const listNode = listRef.current;
    if (!listNode) {
      return;
    }
    const target = (
      listNode.querySelector('[data-selected="true"]') ??
      listNode.querySelector('[data-active="true"]')
    ) as HTMLElement | null;
    target?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filteredOptions.length, isOpen]);

  const selectOption = (iso2: string) => {
    const option = PHONE_OPTION_BY_ISO.get(iso2);
    if (!option) {
      return;
    }

    onSelectedIsoChange(option.iso2);
    onPhoneTextChange(replaceDialCodeInPhoneText(phoneText, option.dialCode));
    setIsOpen(false);
    setQuery("");
  };

  const renderedPopover = isOpen ? createPortal(
    <div
      ref={popoverRef}
      className={`auth-phone-country-popover auth-phone-country-popover--${placement}`}
      style={{ left: `${popoverStyle.left}px`, top: `${popoverStyle.top}px`, width: `${popoverStyle.width}px` }}
    >
      <div className="auth-phone-country-search-row">
        <span className="auth-phone-country-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79L19 20.49 20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <input
          className="vrm-input auth-phone-country-search"
          placeholder=""
          aria-label="Search countries"
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
                selectOption(activeOption.iso2);
              }
            } else if (event.key === "Escape") {
              event.preventDefault();
              setIsOpen(false);
              setQuery("");
            }
          }}
        />
      </div>

      <ul ref={listRef} className="auth-phone-country-options" role="listbox">
        {filteredOptions.map((option, index) => {
          const isActive = index === activeIndex;
          const isSelected = option.iso2 === selectedCountry.iso2;
          return (
            <li key={`${option.iso2}-${option.displayName}`}>
              <button
                type="button"
                className={`auth-phone-country-option ${isActive ? "auth-phone-country-option--active" : ""} ${isSelected ? "auth-phone-country-option--selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option.iso2)}
                data-active={isActive ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
              >
                <span className="auth-phone-country-option-iso">{option.iso2}</span>
                <span className="auth-phone-country-option-name">{option.displayName}</span>
                <span className="auth-phone-country-option-dial">{option.dialCode}</span>
              </button>
            </li>
          );
        })}
        {filteredOptions.length === 0 ? (
          <li className="auth-phone-country-empty">No matching countries</li>
        ) : null}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="auth-phone-row" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        id={`${idPrefix}-country`}
        className="vrm-input auth-phone-country-trigger"
        onClick={() => {
          setIsOpen((value) => !value);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{selectedCountry.iso2}</span>
        <span className="auth-phone-country-caret" aria-hidden="true">▾</span>
      </button>

      <input
        id={`${idPrefix}-phone`}
        className={inputClassName}
        autoComplete="tel"
        inputMode="tel"
        placeholder="+44 7700 900123"
        value={phoneText}
        onChange={(event) => onPhoneTextChange(sanitizePhoneText(event.target.value))}
      />

      {renderedPopover}
    </div>
  );
};

export default AuthPhoneField;
