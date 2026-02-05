import React from "react";

type NavListProps = {
  children: React.ReactNode;
  className?: string;
};

const NavList: React.FC<NavListProps> = ({ children, className }) => (
  <div className={["vrm-nav-list", className].filter(Boolean).join(" ")}>
    {children}
  </div>
);

export default NavList;
