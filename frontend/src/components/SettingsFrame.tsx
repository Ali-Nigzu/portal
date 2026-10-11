import React from "react";

import "../features/settings/SettingsPages.css";

type SettingsFrameProps = {
  children: React.ReactNode;
};

const SettingsFrame: React.FC<SettingsFrameProps> = ({ children }) => (
  <section className="settings-frame-frame">{children}</section>
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
  <header className="settings-frame-header">
    <h1 className="settings-frame-title">{title}</h1>
    {action ? <div className="settings-frame-action">{action}</div> : null}
  </header>
);

export { SettingsPageHeader };
