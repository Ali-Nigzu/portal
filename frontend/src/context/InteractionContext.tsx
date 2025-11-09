import React, { createContext, useContext, useMemo, useRef } from 'react';

interface InteractionContextValue {
  syncId: string;
}

const InteractionContext = createContext<InteractionContextValue | undefined>(undefined);

interface InteractionProviderProps {
  pageKey: string;
  children: React.ReactNode;
}

export const InteractionProvider: React.FC<InteractionProviderProps> = ({ pageKey, children }) => {
  const syncIdRef = useRef<string | null>(null);

  if (!syncIdRef.current) {
    const random = Math.random().toString(36).slice(2);
    syncIdRef.current = `${pageKey}-${random}`;
  }

  const value = useMemo<InteractionContextValue>(() => ({ syncId: syncIdRef.current as string }), []);

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>;
};

export const useInteractionContext = () => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteractionContext must be used within an InteractionProvider');
  }
  return context;
};
