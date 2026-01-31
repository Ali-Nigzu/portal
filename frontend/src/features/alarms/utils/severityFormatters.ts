export const getSeverityClass = (severity: string) => {
  switch (severity) {
    case "high":
      return "vrm-status-offline";
    case "medium":
      return "vrm-status-warning";
    case "low":
      return "vrm-status-online";
    default:
      return "vrm-status-offline";
  }
};

export const getSeverityText = (severity: string) => {
  switch (severity) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Unknown";
  }
};
