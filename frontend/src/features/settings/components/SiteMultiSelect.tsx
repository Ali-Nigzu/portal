import React, { useEffect, useMemo, useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleDocClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
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

      {open ? (
        <div className="settings-multiselect-menu" role="listbox" aria-multiselectable="true">
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
      ) : null}
      {error ? <div className="settings-inline-error settings-multiselect-error">{error}</div> : null}
    </div>
  );
};

export default SiteMultiSelect;
