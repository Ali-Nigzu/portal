import React from "react";
import { Link } from "react-router-dom";

import camOSLogo from "../../assets/brand/camos-logo.svg";
import styles from "./AuthLogoHeader.module.css";

const AuthLogoHeader: React.FC = () => (
  <header className={styles.header}>
    <Link className={styles.brand} to="/" aria-label="camOS landing page">
      <img src={camOSLogo} alt="camOS" className={styles.logo} />
    </Link>
  </header>
);

export default AuthLogoHeader;
