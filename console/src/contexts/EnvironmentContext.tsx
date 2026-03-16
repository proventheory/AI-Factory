"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type EnvironmentId = "sandbox" | "staging" | "prod";

const EnvironmentContext = createContext<{
  environment: EnvironmentId;
  setEnvironment: (env: EnvironmentId) => void;
}>({ environment: "staging", setEnvironment: () => {} });

export function useEnvironment() {
  return useContext(EnvironmentContext);
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<EnvironmentId>("staging");
  const setter = useCallback((env: EnvironmentId) => setEnvironment(env), []);
  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment: setter }}>
      {children}
    </EnvironmentContext.Provider>
  );
}
