import React, { useState } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { FormField, Label, Hint, NumberInput, TextInput } from "@dynatrace/strato-components-preview/forms";
import { useSettings } from "../state/SettingsContext";
import { DEFAULT_RATE_CENTS_PER_DP } from "../lib/cost";

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { topN, setTopN, rateCentsPerDp, setRateCentsPerDp, monthlyBudgetUSD, setMonthlyBudgetUSD } = useSettings();
  const [localTopN, setLocalTopN] = useState<number | null>(topN);
  const [localRateStr, setLocalRateStr] = useState<string>(String(rateCentsPerDp));
  const [localBudget, setLocalBudget] = useState<number | null>(monthlyBudgetUSD);

  const parsedRate = parseFloat(localRateStr);
  const rateValid = !isNaN(parsedRate) && parsedRate >= 0;

  const apply = () => {
    setTopN(Math.max(1, Math.min(200, localTopN ?? 1)));
    setRateCentsPerDp(rateValid ? parsedRate : 0);
    setMonthlyBudgetUSD(Math.max(0, localBudget ?? 0));
    onClose();
  };

  const reset = () => {
    setLocalTopN(20);
    setLocalRateStr(String(DEFAULT_RATE_CENTS_PER_DP));
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

        <FormField>
          <Label>Cost per datapoint (cents)</Label>
          <TextInput
            value={localRateStr}
            onChange={(v) => setLocalRateStr(v ?? "")}
            placeholder="e.g. 0.00000045"
          />
          {!rateValid && localRateStr !== "" && (
            <Hint>Enter a valid non-negative number.</Hint>
          )}
          <Hint>
            Default: {DEFAULT_RATE_CENTS_PER_DP} ¢/DP (= ${(DEFAULT_RATE_CENTS_PER_DP / 100).toExponential(3)}/DP). Supports tiny fractions like 0.00000045.
          </Hint>
        </FormField>

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
