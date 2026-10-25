import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/* Tells the page when the intro is finished, so the hero (and nav) can
   animate in at the exact moment the preloader curtain opens. */
const AppReadyContext = createContext({ ready: false, setReady: () => {} });

export function AppReadyProvider({ children }) {
  const [ready, setReadyState] = useState(false);
  const setReady = useCallback((value = true) => setReadyState(value), []);
  const value = useMemo(() => ({ ready, setReady }), [ready, setReady]);
  return <AppReadyContext.Provider value={value}>{children}</AppReadyContext.Provider>;
}

export function useAppReady() {
  return useContext(AppReadyContext);
}
