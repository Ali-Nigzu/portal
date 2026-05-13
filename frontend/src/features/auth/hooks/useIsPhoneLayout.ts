import { useEffect, useState } from "react";

const PHONE_MEDIA_QUERY =
  "(max-width: 768px), ((max-width: 1024px) and (hover: none) and (pointer: coarse))";

const getInitialPhoneState = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(PHONE_MEDIA_QUERY).matches;
};

export const useIsPhoneLayout = () => {
  const [isPhoneLayout, setIsPhoneLayout] = useState(getInitialPhoneState);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsPhoneLayout(event.matches);
    };

    setIsPhoneLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);

    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return isPhoneLayout;
};
