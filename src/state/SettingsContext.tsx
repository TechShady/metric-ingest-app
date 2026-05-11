import React, { createContext, useContext, useState } from "react";

interface SettingsCtx {
  topN: number;
  setTopN: (n: number) => void;
  rateCentsPerDp: number;
  setRateCentsPerDp: (n: number) => void;
  monthlyBudgetUSD: number;
  setMonthlyBudgetUSD: (n: number) => void;
}

const Ctx = createContext<SettingsCtx>({
  topN: 20,
  setTopN: () => {},
  rateCentsPerDp: 0,
  setRateCentsPerDp: () => {},
  monthlyBudgetUSD: 0,
  setMonthlyBudgetUSD: () => {},
});

interface ProviderProps {
  defaultTopN: number;
  defaultRateCentsPerDp: number;
  defaultMonthlyBudgetUSD?: number;
  children: React.ReactNode;
}

export const SettingsProvider: React.FC<ProviderProps> = ({
  defaultTopN,
  defaultRateCentsPerDp,
  defaultMonthlyBudgetUSD = 0,
  children,
}) => {
  const [topN, setTopN] = useState<number>(defaultTopN);
  const [rateCentsPerDp, setRateCentsPerDp] = useState<number>(defaultRateCentsPerDp);
  const [monthlyBudgetUSD, setMonthlyBudgetUSD] = useState<number>(defaultMonthlyBudgetUSD);
  return (
    <Ctx.Provider value={{ topN, setTopN, rateCentsPerDp, setRateCentsPerDp, monthlyBudgetUSD, setMonthlyBudgetUSD }}>
      {children}
    </Ctx.Provider>
  );
};

export const useSettings = () => useContext(Ctx);
