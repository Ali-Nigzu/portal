import React from "react";

type NavListProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

const NavList: React.FC<NavListProps> = ({ children, className, ...props }) => (
  <div {...props} className={["vrm-nav-list", className].filter(Boolean).join(" ")}>
    {children}
  </div>
);

export default NavList;
