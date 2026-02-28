import React from "react";
import { Link, NavLink } from "react-router-dom";

import { companyLogoDataUri } from "../../assets/companyLogo";
import styles from "./AuthTopBar.module.css";

const stopNavigation: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
  event.preventDefault();
};

const AuthTopBar: React.FC = () => (
  <header className={styles.topBar}>
    <Link className={styles.brand} to="/" aria-label="camOS landing page">
      <img src={companyLogoDataUri} alt="camOS" className={styles.logo} />
    </Link>

    <nav className={styles.links} aria-label="Auth navigation">
      <a href="#" onClick={stopNavigation} className={styles.link}>
        Learn more about camOS
      </a>
      <NavLink to="/demo" className={styles.link}>
        Try our free demo
      </NavLink>
    </nav>
  </header>
);

export default AuthTopBar;
