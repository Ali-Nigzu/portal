import type { AuthenticatedOrganisation } from "../../features/organisation-dashboard/api";
import { type PortalModule, authenticatedPortalPath, parseAuthenticatedPortalPath } from "../../features/organisation-dashboard/authenticatedPortalRoutes";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

const COMPACT_LAYOUT_QUERY =
  "(max-width: 768px), ((max-width: 1024px) and (hover: none) and (pointer: coarse))";
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

const routeContextFor = (pathname: string): AuthenticatedRouteContext => {
  const portal = parseAuthenticatedPortalPath(pathname);
  if (portal) return { area: "portal", ...portal };
  if (pathname === "/home") return { area: "home" };
  if (pathname.startsWith("/documents")) return { area: "documents" };
  if (pathname === "/settings/access")
    return { area: "settings", section: "access" };
  if (pathname.startsWith("/settings"))
    return { area: "settings", section: "account" };
  return { area: "other" };
};

export function useAuthenticatedNavigation(
  organisations: AuthenticatedOrganisation[],
) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeContext = useMemo(
    () => routeContextFor(location.pathname),
    [location.pathname],
  );
  const [state, dispatch] = useReducer(navigationReducer, { status: "closed" });
  const [compactLayout, setCompactLayout] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pendingScopePathRef = useRef<string | null>(null);
  const suppressNextFocusOpenRef = useRef(false);
  const previousPathRef = useRef(location.pathname);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null)
      window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const close = useCallback(
    (restoreFocus = false) => {
      cancelClose();
      dispatch({ type: "close" });
      if (restoreFocus) {
        suppressNextFocusOpenRef.current = true;
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [cancelClose],
  );

  const openContext = useCallback(() => {
    cancelClose();
    dispatch({ type: "open", stage: contextualStage(routeContext) });
  }, [cancelClose, routeContext]);

  const toggle = useCallback(() => {
    if (state.status === "open") close();
    else openContext();
  }, [close, openContext, state.status]);

  const scheduleClose = useCallback(() => {
    if (!hoverCapable) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => close(), 110);
  }, [cancelClose, close, hoverCapable]);

  useEffect(() => {
    const compact = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const hover = window.matchMedia(HOVER_QUERY);
    const sync = () => {
      setCompactLayout(compact.matches);
      setHoverCapable(hover.matches);
    };
    sync();
    compact.addEventListener?.("change", sync);
    hover.addEventListener?.("change", sync);
    return () => {
      compact.removeEventListener?.("change", sync);
      hover.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    if (previousPathRef.current === location.pathname) return;
    previousPathRef.current = location.pathname;
    if (pendingScopePathRef.current === location.pathname) {
      pendingScopePathRef.current = null;
      if (routeContext.area === "portal") {
        dispatch({
          type: "show-modules",
          organisationId: routeContext.organisationId,
          siteId: routeContext.siteId,
        });
      }
      return;
    }
    pendingScopePathRef.current = null;
    dispatch({ type: "close" });
  }, [location.pathname, routeContext]);

  useEffect(() => {
    dispatch({ type: "close" });
  }, [compactLayout, hoverCapable]);

  useEffect(() => {
    if (state.status !== "open") return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, state.status]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const showPrimary = useCallback(() => dispatch({ type: "show-primary" }), []);
  const handleFocusCapture = useCallback(() => {
    if (suppressNextFocusOpenRef.current) {
      suppressNextFocusOpenRef.current = false;
      return;
    }
    if (hoverCapable && state.status === "closed") openContext();
  }, [hoverCapable, openContext, state.status]);
  const preparePointerFocus = useCallback(() => {
    suppressNextFocusOpenRef.current = true;
  }, []);
  const showScopes = useCallback(
    (organisationId: string) => {
      cancelClose();
      dispatch({ type: "show-scopes", organisationId });
    },
    [cancelClose],
  );
  const showSettings = useCallback(() => {
    cancelClose();
    dispatch({ type: "show-settings" });
  }, [cancelClose]);

  const selectScope = useCallback(
    (organisationId: string, siteId?: string) => {
      const module =
        routeContext.area === "portal" &&
        routeContext.organisationId === organisationId
          ? routeContext.module
          : "dashboard";
      const path = authenticatedPortalPath({ organisationId, siteId, module });
      pendingScopePathRef.current = path;
      dispatch({ type: "show-modules", organisationId, siteId });
      navigate(path);
    },
    [navigate, routeContext],
  );

  const selectModule = useCallback(
    (
      organisationId: string,
      siteId: string | undefined,
      module: PortalModule,
    ) => {
      navigate(authenticatedPortalPath({ organisationId, siteId, module }));
      close();
    },
    [close, navigate],
  );

  const selectDestination = useCallback(
    (path: string) => {
      close();
      navigate(path);
    },
    [close, navigate],
  );

  const stage: NavigationStage | null =
    state.status === "open" ? state.stage : null;
  const stageOrganisation =
    stage && "organisationId" in stage
      ? organisations.find(
          (organisation) => organisation.id === stage.organisationId,
        )
      : undefined;

  return {
    state,
    stage,
    stageOrganisation,
    routeContext,
    compactLayout,
    hoverCapable,
    rootRef,
    triggerRef,
    openContext,
    toggle,
    close,
    cancelClose,
    scheduleClose,
    handleFocusCapture,
    preparePointerFocus,
    showPrimary,
    showScopes,
    showSettings,
    selectScope,
    selectModule,
    selectDestination,
  };
}

export type ReturnTypeOfAuthenticatedNavigation = ReturnType<
  typeof useAuthenticatedNavigation
>;

export type NavigationStage =
  | { kind: "primary" }
  | { kind: "organisation-scopes"; organisationId: string }
  | { kind: "scope-modules"; organisationId: string; siteId?: string }
  | { kind: "settings" };

type NavigationState =
  { status: "closed" } | { status: "open"; stage: NavigationStage };

export type AuthenticatedRouteContext =
  | { area: "home" }
  | { area: "documents" }
  | { area: "settings"; section: "account" | "access" }
  | {
      area: "portal";
      organisationId: string;
      siteId?: string;
      module: PortalModule;
    }
  | { area: "other" };

type NavigationAction =
  | { type: "open"; stage: NavigationStage }
  | { type: "show-primary" }
  | { type: "show-scopes"; organisationId: string }
  | { type: "show-modules"; organisationId: string; siteId?: string }
  | { type: "show-settings" }
  | { type: "close" };

const contextualStage = (
  context: AuthenticatedRouteContext,
): NavigationStage => {
  if (context.area === "portal") {
    return {
      kind: "scope-modules",
      organisationId: context.organisationId,
      siteId: context.siteId,
    };
  }
  if (context.area === "settings") return { kind: "settings" };
  return { kind: "primary" };
};

const navigationReducer = (
  state: NavigationState,
  action: NavigationAction,
): NavigationState => {
  switch (action.type) {
    case "open":
      return { status: "open", stage: action.stage };
    case "show-primary":
      return { status: "open", stage: { kind: "primary" } };
    case "show-scopes":
      return {
        status: "open",
        stage: {
          kind: "organisation-scopes",
          organisationId: action.organisationId,
        },
      };
    case "show-modules":
      return {
        status: "open",
        stage: {
          kind: "scope-modules",
          organisationId: action.organisationId,
          siteId: action.siteId,
        },
      };
    case "show-settings":
      return { status: "open", stage: { kind: "settings" } };
    case "close":
      return { status: "closed" };
    default:
      return state;
  }
};
