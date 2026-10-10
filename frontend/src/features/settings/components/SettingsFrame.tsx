import React from "react";

import styles from "./SettingsFrame.module.css";

type SettingsFrameProps = {
  children: React.ReactNode;
};

const SettingsFrame: React.FC<SettingsFrameProps> = ({ children }) => (
  <section className={styles.frame}>{children}</section>
);

export default SettingsFrame;

type SettingsPageHeaderProps = {
  title: string;
  action?: React.ReactNode;
};

const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({
  title,
  action,
}) => (
  <header className={styles.header}>
    <h1 className={styles.title}>{title}</h1>
    {action ? <div className={styles.action}>{action}</div> : null}
  </header>
);

export { SettingsPageHeader };
