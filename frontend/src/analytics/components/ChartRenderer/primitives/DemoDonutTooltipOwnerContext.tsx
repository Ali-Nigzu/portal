import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type DemoDonutTooltipOwnerValue = {
  activeOwnerId: string | null;
  claim: (ownerId: string) => void;
  release: (ownerId: string) => void;
  clearAll: () => void;
};

const DemoDonutTooltipOwnerContext = createContext<DemoDonutTooltipOwnerValue | null>(null);

export const DemoDonutTooltipProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);

  const claim = useCallback((ownerId: string) => {
    setActiveOwnerId((current) => (current === ownerId ? current : ownerId));
  }, []);

  const release = useCallback((ownerId: string) => {
    setActiveOwnerId((current) => (current === ownerId ? null : current));
  }, []);

  const clearAll = useCallback(() => {
    setActiveOwnerId(null);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", clearAll);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", clearAll);
      clearAll();
    };
  }, [clearAll]);

  const value = useMemo<DemoDonutTooltipOwnerValue>(
    () => ({
      activeOwnerId,
      claim,
      release,
      clearAll,
    }),
    [activeOwnerId, claim, clearAll, release],
  );

  return (
    <DemoDonutTooltipOwnerContext.Provider value={value}>
      {children}
    </DemoDonutTooltipOwnerContext.Provider>
  );
};

export const useDemoDonutTooltipOwner = () => {
  return useContext(DemoDonutTooltipOwnerContext);
};

export const DemoDonutTooltipBoundary = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const owner = useDemoDonutTooltipOwner();
  return (
    <div onPointerLeave={() => owner?.clearAll()}>
      {children}
    </div>
  );
};
