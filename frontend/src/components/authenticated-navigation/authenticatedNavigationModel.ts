import type { PortalModule } from "../../features/organisation-dashboard/authenticatedPortalRoutes";

export type NavigationStage =
  | { kind: "primary" }
  | { kind: "organisation-scopes"; organisationId: string }
  | { kind: "scope-modules"; organisationId: string; siteId?: string }
  | { kind: "settings" };

export type NavigationState =
  | { status: "closed" }
  | { status: "open"; stage: NavigationStage };

export type AuthenticatedRouteContext =
  | { area: "home" }
  | { area: "documents" }
  | { area: "settings"; section: "account" | "access" }
  | { area: "portal"; organisationId: string; siteId?: string; module: PortalModule }
  | { area: "other" };

export type NavigationAction =
  | { type: "open"; stage: NavigationStage }
  | { type: "show-primary" }
  | { type: "show-scopes"; organisationId: string }
  | { type: "show-modules"; organisationId: string; siteId?: string }
  | { type: "show-settings" }
  | { type: "close" };

export const contextualStage = (context: AuthenticatedRouteContext): NavigationStage => {
  if (context.area === "portal") {
    return { kind: "scope-modules", organisationId: context.organisationId, siteId: context.siteId };
  }
  if (context.area === "settings") return { kind: "settings" };
  return { kind: "primary" };
};

export const navigationReducer = (
  state: NavigationState,
  action: NavigationAction,
): NavigationState => {
  switch (action.type) {
    case "open":
      return { status: "open", stage: action.stage };
    case "show-primary":
      return { status: "open", stage: { kind: "primary" } };
    case "show-scopes":
      return { status: "open", stage: { kind: "organisation-scopes", organisationId: action.organisationId } };
    case "show-modules":
      return { status: "open", stage: { kind: "scope-modules", organisationId: action.organisationId, siteId: action.siteId } };
    case "show-settings":
      return { status: "open", stage: { kind: "settings" } };
    case "close":
      return { status: "closed" };
    default:
      return state;
  }
};

