import React from "react";
import { fmtNum } from "../lib/forecast";

interface Row {
  label: string;
  value: number;
  pct?: number;
}

export const BarList: React.FC<{ rows: Row[]; max?: number; valueFmt?: (n: number) => string }> = ({
  rows,
  max,
  valueFmt = fmtNum,
}) => {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
              {r.label}
            </span>
            <span style={{ opacity: 0.85 }}>
              {valueFmt(r.value)}
              {r.pct != null && <span style={{ opacity: 0.6, marginLeft: 6 }}>({r.pct.toFixed(1)}%)</span>}
            </span>
          </div>
          <div style={{ background: "rgba(128,128,128,0.15)", height: 6, borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                width: `${(r.value / m) * 100}%`,
                height: "100%",
                background: "#1496ff",
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
