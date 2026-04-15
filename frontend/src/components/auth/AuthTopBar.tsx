import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import camOSLogo from "../../assets/Untitled design (4).svg";
import styles from "./AuthTopBar.module.css";

const buildSafeDemoReturnTo = (pathname: string, search: string, hash: string) => {
  const candidate = `${pathname}${search}${hash}` || "/";
  return candidate.startsWith("/") ? candidate : "/";
};

const AuthTopBar: React.FC = () => {
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
    <header className={styles.topBar}>
      <div className={styles.leftZone}>
        <Link className={styles.brand} to="/" aria-label="camOS landing page">
          <img src={camOSLogo} alt="camOS" className={styles.logo} />
        </Link>
      </div>

      <div className={styles.centerZone}>
        <div className={styles.splitNav}>
          <NavLink to="/" className={`${styles.link} ${styles.linkLeft}`}>
            Learn more about camOS
          </NavLink>
          <NavLink
            to={demoTarget}
            className={`${styles.link} ${styles.linkRight}`}
            onClick={handleDemoClick}
          >
            Try our free demo
          </NavLink>
        </div>
      </div>

      <div className={styles.rightZone} aria-hidden="true" />
    </header>
  );
};

export default AuthTopBar;
