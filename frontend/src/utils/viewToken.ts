export const getViewTokenFromLocation = (search?: string | null): string | undefined => {
  const params = new URLSearchParams(search ?? window.location.search);
  return params.get('view_token') ?? undefined;
};
