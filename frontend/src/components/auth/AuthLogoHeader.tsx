import React from "react";

import { Link } from "react-router-dom";
import camOSLogo from "../../assets/brand/camos-logo.svg";
import styles from "./AuthLogoHeader.module.css";
import authDesktopArtwork from "../../assets/backgrounds/auth-desktop-artwork.png";

const AuthLogoHeader: React.FC = () => (
  <header className={styles.header}>
    <Link className={styles.brand} to="/" aria-label="camOS landing page">
      <img src={camOSLogo} alt="camOS" className={styles.logo} />
    </Link>
  </header>
);

export default AuthLogoHeader;

const AuthDesktopArtwork: React.FC = () => (
  <img
    src={authDesktopArtwork}
    data-testid="auth-desktop-artwork"
    alt=""
    aria-hidden="true"
    draggable={false}
    className={styles.image}
  />
);

export { AuthDesktopArtwork, AuthLogoHeader };
