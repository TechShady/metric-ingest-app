import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../state/SettingsContext";
import { DEFAULT_RATE_CENTS_PER_DP } from "../lib/cost";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--dt-colors-surface-default, #1a1e38)",
  borderRadius: 8,
  padding: 24,
  width: 420,
  maxWidth: "90vw",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  color: "inherit",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 4,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
};

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { topN, setTopN, rateCentsPerDp, setRateCentsPerDp, monthlyBudgetUSD, setMonthlyBudgetUSD } = useSettings();
  const topNRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);

  const apply = () => {
    const n = parseInt(topNRef.current?.value ?? "20", 10);
    setTopN(Math.max(1, Math.min(200, isNaN(n) ? 20 : n)));
    const r = parseFloat(rateRef.current?.value ?? "0");
    setRateCentsPerDp(isNaN(r) || r < 0 ? 0 : r);
    const b = parseFloat(budgetRef.current?.value ?? "0");
    setMonthlyBudgetUSD(isNaN(b) || b < 0 ? 0 : b);
    onClose();
  };

  const reset = () => {
    if (topNRef.current) topNRef.current.value = "20";
    if (rateRef.current) rateRef.current.value = String(DEFAULT_RATE_CENTS_PER_DP);
    if (budgetRef.current) budgetRef.current.value = "0";
  };

  return createPortal(
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
          <button onClick={onClose} style={{ ...btnStyle, border: "none", fontSize: 18, padding: "2px 8px" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Top N metrics</div>
            <input ref={topNRef} type="number" defaultValue={topN} min={1} max={200} step={1} style={inputStyle} />
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
              How many top metric keys to include in Top N forecasts and Cost Forecast.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Cost per datapoint (cents)</div>
            <input ref={rateRef} type="text" defaultValue={String(rateCentsPerDp)} placeholder="e.g. 0.00000045" style={inputStyle} />
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
              Default: {DEFAULT_RATE_CENTS_PER_DP} ¢/DP (= ${(DEFAULT_RATE_CENTS_PER_DP / 100).toExponential(3)}/DP). Supports tiny fractions like 0.00000045.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Monthly budget (USD)</div>
            <input ref={budgetRef} type="number" defaultValue={monthlyBudgetUSD} min={0} step={1} style={inputStyle} />
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
              Optional. When set, Cost Forecast shows budget burn-down and days-until-exceeded. Leave 0 to disable.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <button onClick={reset} style={btnStyle}>Reset defaults</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnStyle}>Cancel</button>
            <button onClick={apply} style={{ ...btnStyle, background: "#1496ff", color: "#fff", borderColor: "#1496ff" }}>Apply</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
