import React from "react";

export const renderLoading = (_label: string, _variant: "card" | "kpi" = "card") =>
  null;

export const renderError = (message: string) => (
  <div className="dashboard-v2__error" role="alert">
    {message}
  </div>
);
