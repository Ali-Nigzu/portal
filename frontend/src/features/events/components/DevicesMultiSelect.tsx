import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>(undefined);
  const generatedButtonId = useId();
  const buttonId = id ?? generatedButtonId;
  const menuId = useId();
  const selectedTokens = new Set(value);
  const summary = summarizeEventDeviceSelection(value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const triggerRect = wrapperRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }
      const viewportPadding = 12;
      const menuGap = 8;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding;
      const spaceAbove = triggerRect.top - viewportPadding;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        140,
        Math.min(320, (openUp ? spaceAbove : spaceBelow) - menuGap),
      );
      const left = Math.max(viewportPadding, triggerRect.left);
      const maxWidth = window.innerWidth - viewportPadding * 2;
      const width = Math.min(triggerRect.width, maxWidth);
      setMenuStyle({
        left,
        top: openUp
          ? Math.max(viewportPadding, triggerRect.top - maxHeight - menuGap)
          : Math.min(viewportHeight - viewportPadding - maxHeight, triggerRect.bottom + menuGap),
        width,
        maxHeight,
      });
    };

    updateMenuPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node;
      if (
        !wrapperRef.current?.contains(targetNode) &&
        !menuRef.current?.contains(targetNode)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        wrapperRef.current
          ?.querySelector<HTMLButtonElement>(".event-devices-trigger")
          ?.focus();
      }
    };
    const handleReposition = () => {
      updateMenuPosition();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
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

  const menuNode = isOpen ? (
    <div
      aria-labelledby={buttonId}
      aria-multiselectable="true"
      className="event-devices-menu event-devices-menu--portal"
      id={menuId}
      ref={menuRef}
      role="listbox"
      style={menuStyle}
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
  ) : null;

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
      {isOpen ? createPortal(menuNode, document.body) : null}
    </div>
  );
};

export default DevicesMultiSelect;
