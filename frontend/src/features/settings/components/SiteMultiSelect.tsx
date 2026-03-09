import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SiteOption = { id: string; label: string };

type SiteMultiSelectProps = {
  options: SiteOption[];
  selectedSites: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  error?: string | null;
};

const ALL_SITE_ID = "all-sites";

const SiteMultiSelect: React.FC<SiteMultiSelectProps> = ({
  options,
  selectedSites,
  onChange,
  placeholder = "Select sites",
  error,
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(() => {
    if (selectedSites.length === 0) {
      return placeholder;
    }
    const labels = options
      .filter((option) => selectedSites.includes(option.id))
      .map((option) => option.label);
    return labels.join(", ");
  }, [options, placeholder, selectedSites]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setMenuStyle({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleDocClick = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (
        !containerRef.current?.contains(targetNode)
        && !menuRef.current?.contains(targetNode)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  const toggleOption = (siteId: string) => {
    if (siteId === ALL_SITE_ID) {
      if (selectedSites.includes(ALL_SITE_ID)) {
        onChange([]);
        return;
      }
      onChange([ALL_SITE_ID]);
      return;
    }

    const withoutAll = selectedSites.filter((item) => item !== ALL_SITE_ID);
    if (withoutAll.includes(siteId)) {
      onChange(withoutAll.filter((item) => item !== siteId));
      return;
    }
    onChange([...withoutAll, siteId]);
  };

  return (
    <div className="settings-multiselect" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-multiselect-trigger ${open ? "is-open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="settings-multiselect-trigger__label">{selectedLabel}</span>
        <span className="settings-multiselect-trigger__icon" aria-hidden="true">▾</span>
      </button>

      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="settings-multiselect-menu"
              role="listbox"
              aria-multiselectable="true"
              style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
            >
              {options.map((option) => {
                const checked = selectedSites.includes(option.id);
                return (
                  <label className="settings-multiselect-option" key={option.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>,
            document.body,
          )
        : null}
      {error ? <div className="settings-inline-error settings-multiselect-error">{error}</div> : null}
    </div>
  );
};

export default SiteMultiSelect;
