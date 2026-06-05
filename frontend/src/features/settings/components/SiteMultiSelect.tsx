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

type MenuPosition = {
  left: number;
  top: number;
  width: number;
};

const ALL_SITE_ID = "all-sites";
const MENU_OFFSET = 6;

const SiteMultiSelect: React.FC<SiteMultiSelectProps> = ({
  options,
  selectedSites,
  onChange,
  placeholder = "Select sites",
  error,
}) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = containerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + MENU_OFFSET,
        width: rect.width,
      });
    };

    updateMenuPosition();

    const handleDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocClick);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (selectedSites.length === 0) {
      return placeholder;
    }
    const labels = options
      .filter((option) => selectedSites.includes(option.id))
      .map((option) => option.label);
    return labels.join(", ");
  }, [options, placeholder, selectedSites]);

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

  const menu = open && menuPosition ? (
    <div
      className="settings-multiselect-menu settings-multiselect-menu--portal"
      ref={menuRef}
      role="listbox"
      aria-multiselectable="true"
      style={{
        left: menuPosition.left,
        top: menuPosition.top,
        width: menuPosition.width,
      }}
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
    </div>
  ) : null;

  return (
    <div className="settings-multiselect" ref={containerRef}>
      <button
        type="button"
        className="settings-multiselect-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {selectedLabel}
      </button>

      {menu ? createPortal(menu, document.body) : null}
      {error ? <div className="settings-inline-error settings-multiselect-error">{error}</div> : null}
    </div>
  );
};

export default SiteMultiSelect;
