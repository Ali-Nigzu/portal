import React from "react";

import authDesktopArtwork from "../../assets/backgrounds/auth-desktop-artwork.png";
import styles from "./AuthDesktopArtwork.module.css";

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

export default AuthDesktopArtwork;
