import React from "react";
import { Bell, Settings, Shield } from "lucide-react";
import { useLocation } from "react-router-dom";

import { NavList, NavRow, SecondaryDivider } from "../../../common/components/navigation";
import { NavIcon } from "../../../common/components/icons";

const SettingsSecondaryNav: React.FC = () => {
  const location = useLocation();
  const isAccountRoute = location.pathname === "/settings/account";
  const isAccessRoute = location.pathname === "/settings/access";

  return (
    <>
      <div className="vrm-secondary-header">
        <div className="vrm-nav-row vrm-nav-row--inert">
          <span className="vrm-nav-row__icon"><NavIcon icon={Settings} /></span>
          <span className="vrm-nav-row__label">Settings</span>
        </div>
        <SecondaryDivider />
      </div>
      <NavList className="vrm-secondary-list">
        <NavRow
          to="/settings/account"
          leftIcon={<NavIcon icon={Settings} />}
          label="My Account"
          active={isAccountRoute}
        />
        <NavRow
          to="/settings/access"
          leftIcon={<NavIcon icon={Shield} />}
          label="Manage Access"
          active={isAccessRoute}
        />
        <NavRow
          leftIcon={<NavIcon icon={Bell} />}
          label="Create Alarm"
          disabled
        />
      </NavList>
    </>
  );
};

export default SettingsSecondaryNav;
