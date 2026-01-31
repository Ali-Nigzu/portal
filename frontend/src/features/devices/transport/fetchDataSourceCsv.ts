export const fetchDataSourceCsv = async (sourceUrl: string) => {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error("Failed to download data");
  }
  return response.text();
};
