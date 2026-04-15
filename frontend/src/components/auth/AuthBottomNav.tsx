import React from "react";
import { NavLink, useLocation } from "react-router-dom";

import styles from "./AuthBottomNav.module.css";

const buildSafeDemoReturnTo = (pathname: string, search: string, hash: string) => {
  const candidate = `${pathname}${search}${hash}` || "/";
  return candidate.startsWith("/") ? candidate : "/";
};

const AuthBottomNav: React.FC = () => {
  const location = useLocation();
  const returnTo = buildSafeDemoReturnTo(
    location.pathname,
    location.search,
    location.hash,
  );
  const demoTarget = `/demo?returnTo=${encodeURIComponent(returnTo)}`;

  const handleDemoClick = () => {
    sessionStorage.setItem("demo:returnTo", returnTo);
  };

  return (
    <footer className={styles.footer} aria-label="Auth page footer navigation">
      <nav className={styles.nav}>
        <NavLink to="/" className={styles.link}>
          Learn more about camOS
        </NavLink>
        <NavLink to={demoTarget} className={styles.link} onClick={handleDemoClick}>
          Try our free demo
        </NavLink>
      </nav>
    </footer>
  );
};

export default AuthBottomNav;
