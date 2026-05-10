import React from "react";

type MobileSidebarRowProps = {
  label: React.ReactNode;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  onTap: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

const MobileSidebarRow: React.FC<MobileSidebarRowProps> = ({
  label,
  icon,
  rightSlot,
  active,
  disabled,
  className,
  ariaLabel,
  onTap,
  onPointerDown,
}) => {
  const classes = [
    "mobile-expanded-row-shell",
    active ? "mobile-expanded-row--active" : "",
    disabled ? "mobile-expanded-row--disabled" : "mobile-expanded-row--interactive",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onPointerDown?.(event);
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onTap(event);
  };
  return (
    <div
      className={classes}
      data-mobile-sidebar-row="true"
      data-mobile-sidebar-disabled={disabled ? "true" : undefined}
    >
      <button
        type="button"
        className="mobile-expanded-row-hitbox"
        aria-label={ariaLabel}
        aria-disabled={disabled ? "true" : undefined}
        disabled={false}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      />
      {icon && <span className="mobile-expanded-row__icon">{icon}</span>}
      <span className="mobile-expanded-row__label">{label}</span>
      {rightSlot && <span className="mobile-expanded-row__right">{rightSlot}</span>}
    </div>
  );
};

export default MobileSidebarRow;
