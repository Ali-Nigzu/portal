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

const DEFAULT_POPOVER_WIDTH = 276;
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
    setActiveIndex(0);
  }, [query, isOpen]);

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

    const desiredWidth = Math.max(Math.round(triggerRect.width + 160), DEFAULT_POPOVER_WIDTH);
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
              selectOption(activeOption.iso2);
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
            <li key={`${option.iso2}-${option.displayName}`}>
              <button
                type="button"
                className={`auth-phone-country-option ${isActive ? "auth-phone-country-option--active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option.iso2)}
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
