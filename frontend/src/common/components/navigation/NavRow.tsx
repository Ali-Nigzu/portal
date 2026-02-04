import React from "react";
import { Link } from "react-router-dom";

export type NavRowProps = {
  label: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  role?: string;
};

const NavRow: React.FC<NavRowProps> = ({
  label,
  leftIcon,
  rightSlot,
  to,
  onClick,
  active,
  disabled,
  className,
  ariaLabel,
  role,
}) => {
  const baseClass = [
    "vrm-nav-row",
    active ? "vrm-nav-row--active" : "",
    disabled ? "vrm-nav-row--disabled" : "vrm-nav-row--interactive",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leftIcon && <span className="vrm-nav-row__icon">{leftIcon}</span>}
      <span className="vrm-nav-row__label">{label}</span>
      {rightSlot && <span className="vrm-nav-row__right">{rightSlot}</span>}
    </>
  );

  if (disabled) {
    return (
      <div
        className={baseClass}
        aria-label={ariaLabel}
        aria-disabled="true"
        role={role ?? "listitem"}
      >
        {content}
      </div>
    );
  }

  if (to) {
    return (
      <Link className={baseClass} to={to} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={baseClass}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass} aria-label={ariaLabel} role={role ?? "listitem"}>
      {content}
    </div>
  );
};

export default NavRow;
