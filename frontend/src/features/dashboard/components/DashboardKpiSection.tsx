import React from "react";
import type { DashboardWidgetState } from "../types";
import KpiBand from "./KpiBand";

type DashboardKpiSectionProps = {
  mode?: "full" | "preview";
  kpiWidgets: DashboardWidgetState[];
  onRemoveWidget: (widgetId: string) => void;
  className?: string;
  rendererClassName?: string;
};

const DashboardKpiSection: React.FC<DashboardKpiSectionProps> = ({
  mode = "full",
  kpiWidgets,
  onRemoveWidget,
  className,
  rendererClassName,
}) => {
  if (kpiWidgets.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <KpiBand
        mode={mode}
        kpiWidgets={kpiWidgets}
        onRemoveWidget={onRemoveWidget}
        rendererClassName={rendererClassName}
      />
    </div>
  );
};

export default DashboardKpiSection;
