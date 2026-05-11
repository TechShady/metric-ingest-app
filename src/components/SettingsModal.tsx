import React, { useRef } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
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

  return (
    <Modal
      title="Settings"
      show
      size="small"
      onDismiss={onClose}
      footer={
        <Flex justifyContent="space-between" width="100%">
          <Button variant="default" onClick={reset}>Reset defaults</Button>
          <Flex gap={8}>
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button variant="accent" color="primary" onClick={apply}>Apply</Button>
          </Flex>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={16}>
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
      </Flex>
    </Modal>
  );
};
