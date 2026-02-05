import React from "react";
import { LucideIcon } from "lucide-react";

type NavIconProps = {
  icon: LucideIcon;
  className?: string;
  size?: number;
  strokeWidth?: number;
};

const NavIcon: React.FC<NavIconProps> = ({
  icon: Icon,
  className,
  size = 20,
  strokeWidth = 1.6,
}) => (
  <Icon
    className={["vrm-nav-icon", className].filter(Boolean).join(" ")}
    size={size}
    strokeWidth={strokeWidth}
    aria-hidden="true"
  />
);

export default NavIcon;
