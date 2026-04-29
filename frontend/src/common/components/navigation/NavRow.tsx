import React from "react";
import { Link } from "react-router-dom";

export type NavRowProps = {
  label: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  to?: string;
  replace?: boolean;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
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
  replace,
  onClick,
  onMouseEnter,
  onMouseLeave,
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
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {content}
      </div>
    );
  }

  if (to) {
    return (
      <Link
        className={baseClass}
        to={to}
        replace={replace}
        aria-label={ariaLabel}
        onClick={onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
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
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={baseClass}
      aria-label={ariaLabel}
      role={role ?? "listitem"}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {content}
    </div>
  );
};

export default NavRow;
