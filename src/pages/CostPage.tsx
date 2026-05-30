import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable, Column } from "../components/SortableTable";
import { fetchAllMetricCardinality, MetricKeyRow } from "../lib/queries";
import { fmtNum } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

interface Props { timeframe: string; }

const MAX_CARDINALITY_TF = "now()-7d";
const capTimeframe = (tf: string): { capped: string; wasCapped: boolean } => {
  const m = tf.match(/^now\(\)-(\d+)([dhm])$/);
  if (!m) return { capped: tf, wasCapped: false };
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const hours = unit === "d" ? n * 24 : unit === "h" ? n : n / 60;
  if (hours > 7 * 24) return { capped: MAX_CARDINALITY_TF, wasCapped: true };
  return { capped: tf, wasCapped: false };
};

/** Parse timeframe string like "now()-7d" to number of days. */
function timeframeDays(tf: string): number {
  const m = tf.match(/^now\(\)-(\d+)([dhm])$/);
  if (!m) return 7;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "d") return n;
  if (unit === "h") return n / 24;
  return n / (24 * 60);
}

const ASSUMED_DP_PER_SERIES_PER_DAY = 1440;

export const CostPage: React.FC<Props> = ({ timeframe }) => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string>("");
  const [rows, setRows] = useState<MetricKeyRow[]>([]);
  const [filter, setFilter] = useState("");
  const [capped, setCapped] = useState(false);

  const days = timeframeDays(timeframe);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    const { capped: tf, wasCapped } = capTimeframe(timeframe);
    setCapped(wasCapped);
    setProgress(`Querying metric cardinality (chunked by prefix)...`);
    (async () => {
      const r = await fetchAllMetricCardinality(tf);
      if (abort) return;
      setRows(r);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [timeframe]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((x) => x.metric_key.toLowerCase().includes(filter.toLowerCase()));
  }, [rows, filter]);

  // Cost calculations for the full timeframe
  const totalDpInPeriod = rows.reduce((a, b) => a + b.series * ASSUMED_DP_PER_SERIES_PER_DAY * days, 0);
  const totalCostInPeriod = costUSD(totalDpInPeriod, rateCentsPerDp);

  const filteredDpInPeriod = filtered.reduce((a, b) => a + b.series * ASSUMED_DP_PER_SERIES_PER_DAY * days, 0);
  const filteredCostInPeriod = costUSD(filteredDpInPeriod, rateCentsPerDp);
  const filteredMonthlyCost = costUSD(filtered.reduce((a, b) => a + b.estDailyDatapoints, 0), rateCentsPerDp) * 30;
  const filteredAnnualCost = costUSD(filtered.reduce((a, b) => a + b.estDailyDatapoints, 0), rateCentsPerDp) * 365;

  const columns = useMemo((): Column<MetricKeyRow>[] => {
    const dpForRow = (r: MetricKeyRow) => r.series * ASSUMED_DP_PER_SERIES_PER_DAY * days;
    return [
      { key: "name", header: "Metric key", render: (r) => <code>{r.metric_key}</code>, sortValue: (r) => r.metric_key },
      { key: "series", header: "Series", align: "right", render: (r) => fmtNum(r.series), sortValue: (r) => r.series },
      { key: "dp", header: `Datapoints (${days >= 1 ? Math.round(days) + "d" : Math.round(days * 24) + "h"})`, align: "right", render: (r) => fmtNum(dpForRow(r)), sortValue: (r) => dpForRow(r) },
      { key: "cost", header: `Cost (${days >= 1 ? Math.round(days) + "d" : Math.round(days * 24) + "h"})`, align: "right",
        render: (r) => {
          const c = costUSD(dpForRow(r), rateCentsPerDp);
          return <span style={{ fontWeight: 600 }}>{fmtUSD(c)}</span>;
        },
        sortValue: (r) => dpForRow(r) },
      { key: "monthly", header: "Est. $/month", align: "right",
        render: (r) => fmtUSD(costUSD(r.estDailyDatapoints, rateCentsPerDp) * 30),
        sortValue: (r) => r.estDailyDatapoints },
      { key: "annual", header: "Est. $/year", align: "right",
        render: (r) => fmtUSD(costUSD(r.estDailyDatapoints, rateCentsPerDp) * 365),
        sortValue: (r) => r.estDailyDatapoints },
      { key: "pct", header: "% of total", align: "right",
        render: (r) => {
          const pct = totalDpInPeriod > 0 ? (dpForRow(r) / totalDpInPeriod) * 100 : 0;
          return <span style={{
            fontWeight: pct >= 5 ? 700 : 400,
            color: pct >= 10 ? "#ef4444" : pct >= 5 ? "#f59e0b" : undefined,
          }}>{pct.toFixed(2)}%</span>;
        },
        sortValue: (r) => r.series },
    ];
  }, [days, rateCentsPerDp, totalDpInPeriod]);

  if (loading) return <Loader msg={progress} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {capped && (
        <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, fontSize: 12 }}>
          Timeframe capped to 7 days for cardinality query. Cost calculated over original timeframe ({timeframe}).
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Distinct metric keys" value={String(rows.length)} />
        <Stat label={`Total cost (${Math.round(days)}d)`}
              value={fmtUSD(totalCostInPeriod)}
              sub={`${fmtNum(totalDpInPeriod)} datapoints`} />
        <Stat label="Est. monthly cost" value={fmtUSD(costUSD(rows.reduce((a, b) => a + b.estDailyDatapoints, 0), rateCentsPerDp) * 30)} />
        <Stat label="Est. annual cost" value={fmtUSD(costUSD(rows.reduce((a, b) => a + b.estDailyDatapoints, 0), rateCentsPerDp) * 365)} />
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <input
            placeholder="Filter metric keys..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: "6px 10px",
              background: "rgba(128,128,128,0.1)",
              border: "1px solid rgba(128,128,128,0.3)",
              borderRadius: 4, color: "inherit",
            }}
          />
          <span style={{ fontSize: 12, opacity: 0.7 }}>{filtered.length} matches</span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: "#1496ff",
            padding: "4px 12px", background: "rgba(20,150,255,0.08)", borderRadius: 4,
            border: "1px solid rgba(20,150,255,0.2)",
          }}>
            🔥 Filtered: {fmtUSD(filteredCostInPeriod)}/{Math.round(days)}d &nbsp;|&nbsp; {fmtUSD(filteredMonthlyCost)}/mo &nbsp;|&nbsp; {fmtUSD(filteredAnnualCost)}/yr
          </span>
        </div>

        <SortableTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.metric_key}
          maxHeight={520}
          maxRows={500}
          defaultSortKey="cost"
          defaultSortDir="desc"
        />
      </Card>

      <Card>
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          Rate: <strong>${rateCentsPerDp}/DP</strong> (= $45.50 per 100M datapoints at default).
          Datapoints estimated as series × 1,440/day (1-min resolution).
          Adjust rate in Settings (gear icon). Tip: filter by metric prefix to show cost for a specific team or source.
        </div>
      </Card>
    </div>
  );
};
