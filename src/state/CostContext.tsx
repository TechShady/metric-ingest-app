import React, { createContext, useContext, useState } from "react";
import { DEFAULT_RATE_CENTS_PER_DP } from "../lib/cost";

interface CostCtx {
  rateCentsPerDp: number;
  setRateCentsPerDp: (n: number) => void;
}

const Ctx = createContext<CostCtx>({
  rateCentsPerDp: DEFAULT_RATE_CENTS_PER_DP,
  setRateCentsPerDp: () => {},
});

export const CostProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rateCentsPerDp, setRateCentsPerDp] = useState<number>(DEFAULT_RATE_CENTS_PER_DP);
  return (
    <Ctx.Provider value={{ rateCentsPerDp, setRateCentsPerDp }}>
      {children}
    </Ctx.Provider>
  );
};

export const useCost = () => useContext(Ctx);
