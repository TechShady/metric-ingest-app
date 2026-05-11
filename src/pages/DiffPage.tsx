import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { fetchAllMetricCardinality, MetricKeyRow } from "../lib/queries";
import { fmtNum } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

const ASSUMED_DP_PER_SERIES_PER_DAY = 1440;

interface DiffRow {
  metric_key: string;
  current: number;
  previous: number;
  delta: number;
  pctChange: number;
  isNew: boolean;
  isGone: boolean;
  costDelta: number;
}

type Period = "7d" | "14d" | "30d";
type Filter = "all" | "new" | "gone" | "grew" | "shrank";

export const DiffPage: React.FC = () => {
  const { rateCentsPerDp } = useSettings();
  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [filter, setFilter] = useState<Filter>("new");
  const [textFilter, setTextFilter] = useState("");

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      setProgress(`Fetching current cardinality...`);
      const current = await fetchAllMetricCardinality("now()-2h");
      if (abort) return;

      setProgress(`Fetching cardinality from ${period} ago...`);
      // 2-hour window ending at "now() - <period>"
      const previous = await fetchAllMetricCardinality(
        `now()-${period}-2h`,
        `now()-${period}`
      );
      if (abort) return;

      const prevMap = new Map<string, number>();
      for (const m of previous) prevMap.set(m.metric_key, m.series);
      const curMap = new Map<string, number>();
      for (const m of current) curMap.set(m.metric_key, m.series);

      const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp);

      const allKeys = new Set<string>([...prevMap.keys(), ...curMap.keys()]);
      const out: DiffRow[] = [];
      allKeys.forEach((k) => {
        const cur = curMap.get(k) ?? 0;
        const prev = prevMap.get(k) ?? 0;
        const delta = cur - prev;
        const pctChange = prev === 0 ? (cur > 0 ? Infinity : 0) : (delta / prev) * 100;
        out.push({
          metric_key: k,
          current: cur,
          previous: prev,
          delta,
          pctChange,
          isNew: prev === 0 && cur > 0,
          isGone: prev > 0 && cur === 0,
          costDelta: dailyCostPerSeries * delta * 365,
        });
      });
      setRows(out);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [period, rateCentsPerDp]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === "new") r = r.filter((x) => x.isNew);
    else if (filter === "gone") r = r.filter((x) => x.isGone);
    else if (filter === "grew") r = r.filter((x) => !x.isNew && !x.isGone && x.delta > 0);
    else if (filter === "shrank") r = r.filter((x) => !x.isNew && !x.isGone && x.delta < 0);
    if (textFilter) r = r.filter((x) => x.metric_key.toLowerCase().includes(textFilter.toLowerCase()));
    // Sort by abs cost delta desc
    return [...r].sort((a, b) => Math.abs(b.costDelta) - Math.abs(a.costDelta));
  }, [rows, filter, textFilter]);

  if (loading) return <Loader msg={progress || "Comparing snapshots..."} />;

  const newRows = rows.filter((r) => r.isNew);
  const goneRows = rows.filter((r) => r.isGone);
  const grewRows = rows.filter((r) => !r.isNew && !r.isGone && r.delta > 0);
  const shrankRows = rows.filter((r) => !r.isNew && !r.isGone && r.delta < 0);

  const totalDelta = rows.reduce((a, r) => a + r.delta, 0);
  const totalCostDelta = rows.reduce((a, r) => a + r.costDelta, 0);
  const totalNew = newRows.reduce((a, r) => a + r.current, 0);
  const totalGone = goneRows.reduce((a, r) => a + r.previous, 0);
  const newAnnual = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp) * totalNew * 365;
  const goneAnnual = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp) * totalGone * 365;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Compare current to:</span>
          {(["7d", "14d", "30d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                ...btnSec,
                background: period === p ? "rgba(20,150,255,0.15)" : "transparent",
                borderColor: period === p ? "#1496ff" : "rgba(128,128,128,0.4)",
              }}
            >
              {p} ago
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Stat label="New metric keys" value={fmtNum(newRows.length)}
              sub={`${fmtNum(totalNew)} series → ${fmtUSD(newAnnual)}/yr`} />
        <Stat label="Disappeared metric keys" value={fmtNum(goneRows.length)}
              sub={`${fmtNum(totalGone)} series → ${fmtUSD(goneAnnual)}/yr removed`} />
        <Stat label="Grew" value={fmtNum(grewRows.length)} />
        <Stat label="Shrank" value={fmtNum(shrankRows.length)} />
        <Stat label="Net series change" value={(totalDelta >= 0 ? "+" : "") + fmtNum(totalDelta)}
              sub={`${totalCostDelta >= 0 ? "+" : ""}${fmtUSD(totalCostDelta)}/yr`} />
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={inputStyle}>
            <option value="new">🆕 New ({newRows.length})</option>
            <option value="gone">🗑 Disappeared ({goneRows.length})</option>
            <option value="grew">📈 Grew ({grewRows.length})</option>
            <option value="shrank">📉 Shrank ({shrankRows.length})</option>
            <option value="all">All changed ({rows.length})</option>
          </select>
          <input
            placeholder="Filter metric keys..."
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <span style={{ fontSize: 12, opacity: 0.7 }}>{filtered.length} matches</span>
        </div>
      </Card>

      <Card>
        <div style={{ maxHeight: 600, overflowY: "auto", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 4 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "rgba(128,128,128,0.15)" }}>
              <tr>
                <th style={th}>Metric key</th>
                <th style={{ ...th, textAlign: "right" }}>Then ({period} ago)</th>
                <th style={{ ...th, textAlign: "right" }}>Now</th>
                <th style={{ ...th, textAlign: "right" }}>Δ series</th>
                <th style={{ ...th, textAlign: "right" }}>% change</th>
                <th style={{ ...th, textAlign: "right" }}>Δ annual cost</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r) => {
                const tag = r.isNew ? "NEW" : r.isGone ? "GONE" : null;
                const tagColor = r.isNew ? "#10b981" : r.isGone ? "#6b7280" : "";
                return (
                  <tr key={r.metric_key} style={{ borderBottom: "1px solid rgba(128,128,128,0.15)" }}>
                    <td style={td}>
                      <code>{r.metric_key}</code>
                      {tag && (
                        <span style={{
                          marginLeft: 8, fontSize: 10, padding: "1px 6px",
                          background: tagColor, color: "#fff", borderRadius: 3, fontWeight: 600,
                        }}>{tag}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{r.previous === 0 ? "—" : fmtNum(r.previous)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.current === 0 ? "—" : fmtNum(r.current)}</td>
                    <td style={{ ...td, textAlign: "right",
                                 color: r.delta > 0 ? "#ff6b35" : r.delta < 0 ? "#10b981" : undefined,
                                 fontWeight: 600 }}>
                      {r.delta >= 0 ? "+" : ""}{fmtNum(r.delta)}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {!isFinite(r.pctChange) ? "∞" : `${r.pctChange >= 0 ? "+" : ""}${r.pctChange.toFixed(1)}%`}
                    </td>
                    <td style={{ ...td, textAlign: "right",
                                 color: r.costDelta > 0 ? "#ff6b35" : r.costDelta < 0 ? "#10b981" : undefined,
                                 fontWeight: 600 }}>
                      {r.costDelta >= 0 ? "+" : ""}{fmtUSD(r.costDelta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div style={{ padding: 8, fontSize: 12, opacity: 0.7, textAlign: "center" }}>
              Showing first 500 of {filtered.length}.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          Compares 2-hour cardinality snapshots from <em>now</em> vs <em>{period} ago</em>. Sorted by absolute Δ annual cost. Values may be approximate when a metric is bursty within the 2h window.
        </div>
      </Card>
    </div>
  );
};

const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "6px 10px", verticalAlign: "top" };
const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 13,
};
const btnSec: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};
