import React from "react";

export const renderLoading = (label: string, variant: "card" | "kpi" = "card") => (
  <div
    className={`dashboard-v2__skeleton dashboard-v2__skeleton--${variant}`}
    role="status"
    aria-label={`Loading ${label}`}
  >
    <span className="dashboard-v2__skeleton-line" />
    {variant === "card" ? <span className="dashboard-v2__skeleton-line dashboard-v2__skeleton-line--short" /> : null}
  </div>
);

export const renderError = (message: string) => (
  <div className="dashboard-v2__error" role="alert">
    {message}
  </div>
);
