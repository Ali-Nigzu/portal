import { ArrowLeft, Settings, Shield } from "lucide-react";
import { NavIcon } from "../../common/components/icons";
import type { AuthenticatedRouteContext } from "./authenticatedNavigationModel";

type Props = {
  routeContext: AuthenticatedRouteContext;
  showBack: boolean;
  onBack: () => void;
  onDestination: (path: string) => void;
};

export default function AuthenticatedSettingsPanel({ routeContext, showBack, onBack, onDestination }: Props) {
  const section = routeContext.area === "settings" ? routeContext.section : undefined;
  return (
    <div className="authenticated-navigation__panel" role="navigation" aria-label="Settings navigation">
      <header className="authenticated-navigation__panel-header">
        {showBack && (
          <button type="button" className="authenticated-navigation__back" onClick={onBack} aria-label="Back to primary navigation">
            <NavIcon icon={ArrowLeft} size={18} />
            <span>Primary</span>
          </button>
        )}
        <div className="authenticated-navigation__eyebrow">Account</div>
        <strong>Settings</strong>
      </header>
      <div className="authenticated-navigation__panel-list">
        <button
          type="button"
          className={`authenticated-navigation__row ${section === "account" ? "is-active" : ""}`}
          aria-current={section === "account" ? "page" : undefined}
          onClick={() => onDestination("/settings/account")}
        >
          <span className="authenticated-navigation__icon"><NavIcon icon={Settings} /></span>
          <span className="authenticated-navigation__label">My Account</span>
        </button>
        <button
          type="button"
          className={`authenticated-navigation__row ${section === "access" ? "is-active" : ""}`}
          aria-current={section === "access" ? "page" : undefined}
          onClick={() => onDestination("/settings/access")}
        >
          <span className="authenticated-navigation__icon"><NavIcon icon={Shield} /></span>
          <span className="authenticated-navigation__label">Manage Access</span>
        </button>
      </div>
    </div>
  );
}
