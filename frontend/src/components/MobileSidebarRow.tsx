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
    "mobile-sidebar-pill-row",
    active ? "mobile-sidebar-pill-row--active" : "",
    disabled ? "mobile-sidebar-pill-row--disabled" : "mobile-sidebar-pill-row--interactive",
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
    <button
      type="button"
      className={classes}
      aria-label={ariaLabel}
      aria-disabled={disabled ? "true" : undefined}
      disabled={false}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      data-mobile-sidebar-row="true"
      data-mobile-sidebar-disabled={disabled ? "true" : undefined}
    >
      {icon && <span className="mobile-sidebar-pill-row__icon">{icon}</span>}
      <span className="mobile-sidebar-pill-row__label">{label}</span>
      {rightSlot && <span className="mobile-sidebar-pill-row__right">{rightSlot}</span>}
    </button>
  );
};

export default MobileSidebarRow;
