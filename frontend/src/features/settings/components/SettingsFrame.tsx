import React from "react";

import styles from "./SettingsFrame.module.css";

type SettingsFrameProps = {
  children: React.ReactNode;
};

const SettingsFrame: React.FC<SettingsFrameProps> = ({ children }) => (
  <section className={styles.frame}>{children}</section>
);

export default SettingsFrame;
