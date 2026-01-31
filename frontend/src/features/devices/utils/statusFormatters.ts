export const getStatusClass = (status: string) => {
  switch (status) {
    case "online":
      return "vrm-status-online";
    case "offline":
      return "vrm-status-offline";
    case "maintenance":
      return "vrm-status-warning";
    default:
      return "vrm-status-offline";
  }
};

export const getStatusText = (status: string) => {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "maintenance":
      return "Maintenance";
    default:
      return "Unknown";
  }
};
