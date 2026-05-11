import React, { useRef, useState } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { FormField, Label, Hint, NumberInput } from "@dynatrace/strato-components-preview/forms";
import { useSettings } from "../state/SettingsContext";
import { DEFAULT_RATE_CENTS_PER_DP } from "../lib/cost";

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { topN, setTopN, rateCentsPerDp, setRateCentsPerDp, monthlyBudgetUSD, setMonthlyBudgetUSD } = useSettings();
  const [localTopN, setLocalTopN] = useState<number | null>(topN);
  const rateRef = useRef<HTMLInputElement>(null);
  const [localBudget, setLocalBudget] = useState<number | null>(monthlyBudgetUSD);

  const readRate = (): number => {
    const v = parseFloat(rateRef.current?.value ?? "");
    return isNaN(v) || v < 0 ? 0 : v;
  };

  const apply = () => {
    setTopN(Math.max(1, Math.min(200, localTopN ?? 1)));
    setRateCentsPerDp(readRate());
    setMonthlyBudgetUSD(Math.max(0, localBudget ?? 0));
    onClose();
  };

  const reset = () => {
    setLocalTopN(20);
    if (rateRef.current) rateRef.current.value = String(DEFAULT_RATE_CENTS_PER_DP);
    setLocalBudget(0);
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
        <FormField>
          <Label>Top N metrics</Label>
          <NumberInput
            value={localTopN}
            onChange={(v) => setLocalTopN(v)}
            min={1}
            max={200}
            step={1}
          />
          <Hint>How many top metric keys to include in Top N forecasts and Cost Forecast.</Hint>
        </FormField>

        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Cost per datapoint (cents)</div>
          <input
            ref={rateRef}
            type="text"
            defaultValue={String(rateCentsPerDp)}
            placeholder="e.g. 0.00000045"
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "rgba(128,128,128,0.1)",
              border: "1px solid rgba(128,128,128,0.3)",
              borderRadius: 4,
              color: "inherit",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
            Default: {DEFAULT_RATE_CENTS_PER_DP} ¢/DP (= ${(DEFAULT_RATE_CENTS_PER_DP / 100).toExponential(3)}/DP). Supports tiny fractions like 0.00000045.
          </div>
        </div>

        <FormField>
          <Label>Monthly budget (USD)</Label>
          <NumberInput
            value={localBudget}
            onChange={(v) => setLocalBudget(v)}
            min={0}
            step={1}
          />
          <Hint>Optional. When set, Cost Forecast shows budget burn-down and days-until-exceeded. Leave 0 to disable.</Hint>
        </FormField>
      </Flex>
    </Modal>
  );
};
