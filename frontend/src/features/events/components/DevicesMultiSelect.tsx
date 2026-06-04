import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  EVENT_DEVICE_OPTIONS,
  summarizeEventDeviceSelection,
  type EventDeviceOption,
  type EventDeviceToken,
} from "../utils/eventDevices";

interface DevicesMultiSelectProps {
  id?: string;
  value: EventDeviceToken[];
  onChange: (value: EventDeviceToken[]) => void;
  options?: EventDeviceOption[];
}

const DevicesMultiSelect: React.FC<DevicesMultiSelectProps> = ({
  id,
  value,
  onChange,
  options = EVENT_DEVICE_OPTIONS,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const generatedButtonId = useId();
  const buttonId = id ?? generatedButtonId;
  const menuId = useId();
  const selectedTokens = new Set(value);
  const summary = summarizeEventDeviceSelection(value, options);
  const portalTarget = wrapperRef.current?.closest(".demo-overlay") ?? document.body;

  const updateMenuPosition = () => {
    const wrapper = wrapperRef.current;
    const menu = menuRef.current;
    if (!wrapper || !menu) {
      return;
    }
    const triggerRect = wrapper.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
    const maxMenuHeight = Math.min(320, Math.max(180, viewportHeight - 24));
    const menuHeight = Math.min(maxMenuHeight, menu.scrollHeight || maxMenuHeight);
    const availableBelow = viewportOffsetTop + viewportHeight - triggerRect.bottom - 8;
    const availableAbove = triggerRect.top - viewportOffsetTop - 8;
    const shouldOpenUpward = availableBelow < Math.min(180, menuHeight) && availableAbove > availableBelow;
    const top = shouldOpenUpward
      ? Math.max(viewportOffsetTop + 8, triggerRect.top - Math.min(menuHeight, availableAbove))
      : Math.max(viewportOffsetTop + 8, triggerRect.bottom + 8);
    const maxWidth = Math.max(220, viewportWidth - 16);
    const width = Math.min(Math.max(triggerRect.width, 220), maxWidth);
    const left = Math.min(
      Math.max(viewportOffsetLeft + 8, triggerRect.left),
      viewportOffsetLeft + viewportWidth - width - 8,
    );

    setMenuStyle({
      pointerEvents: "auto",
      position: "fixed",
      top,
      left,
      width,
      maxHeight: shouldOpenUpward
        ? Math.max(120, triggerRect.top - viewportOffsetTop - 8)
        : Math.max(120, viewportOffsetTop + viewportHeight - triggerRect.bottom - 8),
      zIndex: 2400,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    window.visualViewport?.addEventListener("resize", updateMenuPosition);
    window.visualViewport?.addEventListener("scroll", updateMenuPosition);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.visualViewport?.removeEventListener("resize", updateMenuPosition);
      window.visualViewport?.removeEventListener("scroll", updateMenuPosition);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const toggleToken = (token: EventDeviceToken) => {
    if (selectedTokens.has(token)) {
      onChange(value.filter((selectedToken) => selectedToken !== token));
      return;
    }
    onChange([...value, token]);
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
        type="button"
      >
        <span className="event-devices-trigger__label">{summary}</span>
        <span aria-hidden="true" className="event-devices-trigger__chevron">
          ▾
        </span>
      </button>
      {isOpen
        ? createPortal(
            <div
              aria-labelledby={buttonId}
              aria-multiselectable="true"
              className="event-devices-menu"
              id={menuId}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
            >
              {options.map((option) => {
                const isSelected = selectedTokens.has(option.token);
                return (
                  <button
                    aria-selected={isSelected}
                    className={`event-devices-option${isSelected ? " event-devices-option--selected" : ""}`}
                    key={option.token}
                    onClick={() => toggleToken(option.token)}
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
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
};

export default DevicesMultiSelect;
