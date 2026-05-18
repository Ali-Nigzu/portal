import React, { useEffect, useId, useRef, useState } from "react";

import {
  EVENT_DEVICE_OPTIONS,
  summarizeEventDeviceSelection,
  type EventDeviceToken,
} from "../utils/eventDevices";

interface DevicesMultiSelectProps {
  id?: string;
  value: EventDeviceToken[];
  onChange: (value: EventDeviceToken[]) => void;
}

const DevicesMultiSelect: React.FC<DevicesMultiSelectProps> = ({ id, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const generatedButtonId = useId();
  const buttonId = id ?? generatedButtonId;
  const menuId = useId();
  const selectedTokens = new Set(value);
  const summary = summarizeEventDeviceSelection(value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const toggleToken = (token: EventDeviceToken) => {
    if (selectedTokens.has(token)) {
      onChange(value.filter((selectedToken) => selectedToken !== token));
      return;
    }
    onChange([...value, token]);
  };

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
      window.requestAnimationFrame(() => {
        wrapperRef.current
          ?.querySelector<HTMLButtonElement>(".event-devices-option")
          ?.focus();
      });
    }
  };

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    token: EventDeviceToken,
  ) => {
    const options = Array.from(
      wrapperRef.current?.querySelectorAll<HTMLButtonElement>(".event-devices-option") ?? [],
    );
    const currentIndex = options.indexOf(event.currentTarget);

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      wrapperRef.current
        ?.querySelector<HTMLButtonElement>(".event-devices-trigger")
        ?.focus();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleToken(token);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[(currentIndex + 1) % options.length]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      options[(currentIndex - 1 + options.length) % options.length]?.focus();
    }
  };

  return (
    <div className="event-devices-select" ref={wrapperRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="event-devices-trigger event-logs-filter-control"
        id={buttonId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleButtonKeyDown}
        type="button"
      >
        <span className="event-devices-trigger__label">{summary}</span>
        <span aria-hidden="true" className="event-devices-trigger__chevron">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          aria-labelledby={buttonId}
          aria-multiselectable="true"
          className="event-devices-menu"
          id={menuId}
          role="listbox"
        >
          {EVENT_DEVICE_OPTIONS.map((option) => {
            const isSelected = selectedTokens.has(option.token);
            return (
              <button
                aria-selected={isSelected}
                className={`event-devices-option${isSelected ? " event-devices-option--selected" : ""}`}
                key={option.token}
                onClick={() => toggleToken(option.token)}
                onKeyDown={(event) => handleOptionKeyDown(event, option.token)}
                role="option"
                type="button"
              >
                <span aria-hidden="true" className="event-devices-option__check">
                  {isSelected ? "✓" : ""}
                </span>
                <span className="event-devices-option__text">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default DevicesMultiSelect;
