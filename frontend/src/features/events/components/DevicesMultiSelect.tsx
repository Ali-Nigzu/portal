import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type EventDeviceToken = string;
type EventDeviceOption = { token: string; label: string; group?: string };

interface DevicesMultiSelectProps {
  id?: string;
  value: EventDeviceToken[];
  onChange: (value: EventDeviceToken[]) => void;
  options: EventDeviceOption[];
}

const DevicesMultiSelect: React.FC<DevicesMultiSelectProps> = ({
  id,
  value,
  onChange,
  options,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const generatedButtonId = useId();
  const buttonId = id ?? generatedButtonId;
  const menuId = useId();
  const selectedTokens = new Set(value);
  const summary = value.length
    ? `${value.length} source${value.length === 1 ? "" : "s"} selected`
    : "All sources";
  const portalTarget =
    wrapperRef.current?.closest(".demo-overlay") ?? document.body;

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
    const menuHeight = Math.min(
      maxMenuHeight,
      menu.scrollHeight || maxMenuHeight,
    );
    const availableBelow =
      viewportOffsetTop + viewportHeight - triggerRect.bottom - 8;
    const availableAbove = triggerRect.top - viewportOffsetTop - 8;
    const shouldOpenUpward =
      availableBelow < Math.min(180, menuHeight) &&
      availableAbove > availableBelow;
    const top = shouldOpenUpward
      ? Math.max(
          viewportOffsetTop + 8,
          triggerRect.top - Math.min(menuHeight, availableAbove),
        )
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
        : Math.max(
            120,
            viewportOffsetTop + viewportHeight - triggerRect.bottom - 8,
          ),
      zIndex: 2400,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        wrapperRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
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

  const optionGroups = options.reduce<
    { label?: string; options: EventDeviceOption[] }[]
  >((groups, option) => {
    const current = groups.at(-1);
    if (!current || current.label !== option.group) {
      groups.push({ label: option.group, options: [option] });
    } else {
      current.options.push(option);
    }
    return groups;
  }, []);

  return (
    <div className="event-devices-select" ref={wrapperRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`event-devices-trigger event-logs-filter-control${isOpen ? " event-devices-trigger--expanded" : ""}`}
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
              {options.length === 0 ? (
                <div className="event-devices-empty" role="status">
                  <p>No sources in this scope.</p>
                </div>
              ) : (
                optionGroups.map((group, groupIndex) => {
                  const groupId = `${menuId}-group-${groupIndex}`;
                  return (
                    <div
                      aria-labelledby={group.label ? groupId : undefined}
                      className="portal-source-group-wrap"
                      key={group.label ?? "sources"}
                      role="group"
                    >
                      {group.label && (
                        <div className="portal-source-group" id={groupId}>
                          {group.label}
                        </div>
                      )}
                      {group.options.map((option) => {
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
                            <span
                              aria-hidden="true"
                              className="event-devices-option__check"
                            >
                              {isSelected ? "✓" : ""}
                            </span>
                            <span className="event-devices-option__text">
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
};

export default DevicesMultiSelect;
