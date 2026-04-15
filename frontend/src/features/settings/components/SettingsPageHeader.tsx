import React from "react";

import styles from "./SettingsPageHeader.module.css";

type SettingsPageHeaderProps = {
  title: string;
  action?: React.ReactNode;
};

const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({ title, action }) => (
  <header className={styles.header}>
    <h1 className={styles.title}>{title}</h1>
    {action ? <div className={styles.action}>{action}</div> : null}
  </header>
);

export default SettingsPageHeader;
