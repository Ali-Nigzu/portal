import { API_BASE_URL } from "../config";

const DEMO_SESSION_KEY = "camOS_demo_session";

export const isDemoSessionActive = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "true";
};

export const setDemoSessionActive = (active = true): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (active) {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "true");
  } else {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  }
};

export const establishDemoSession = async (): Promise<void> => {
  if (isDemoSessionActive()) {
    return;
  }
  const response = await fetch(`${API_BASE_URL}/api/demo/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to start demo session (${response.status}). ${text}`.trim(),
    );
  }
  setDemoSessionActive(true);
};
