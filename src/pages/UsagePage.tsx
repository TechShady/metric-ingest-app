import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable, Column } from "../components/SortableTable";
import { fetchAllMetricCardinality, fetchMetricQueryStrings, MetricKeyRow } from "../lib/queries";
import { fmtNum } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

const ASSUMED_DP_PER_SERIES_PER_DAY = 1440;

interface UsageRow extends MetricKeyRow {
  queryCount: number;
  status: "idle" | "rare" | "active";
}

const LOOKBACK_DAYS = 30;

export const UsagePage: React.FC = () => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "idle" | "rare" | "active">("idle");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      setProgress("Fetching metric cardinality (chunked)...");
      const metrics = await fetchAllMetricCardinality("now()-2h");
      if (abort) return;

      setProgress(`Fetching ${LOOKBACK_DAYS}d of metric query history (this may take a moment)...`);
      const queries = await fetchMetricQueryStrings(`now()-${LOOKBACK_DAYS}d`);
      if (abort) return;

      setProgress(`Matching ${metrics.length} metrics against ${queries.length} distinct queries...`);
      // Single-pass: join all queries into one blob per query, then count occurrences
      // of each metric key in the blob. O(metrics × blob_length) indexOf scans
      // instead of O(metrics × queries) which crashes the browser on large envs.
      const blob = queries.join("\n").toLowerCase();
      const counts = new Map<string, number>();
      for (const m of metrics) {
        const mk = m.metric_key.toLowerCase();
        let c = 0;
        let idx = blob.indexOf(mk, 0);
        while (idx !== -1) {
          c++;
          idx = blob.indexOf(mk, idx + mk.length);
        }
        counts.set(m.metric_key, c);
      }

      const out: UsageRow[] = metrics.map((m) => {
        const qc = counts.get(m.metric_key) ?? 0;
        const status: UsageRow["status"] = qc === 0 ? "idle" : qc < 3 ? "rare" : "active";
        return { ...m, queryCount: qc, status };
      });
      out.sort((a, b) => b.series - a.series);
      setRows(out);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [refreshTick]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    if (filter) r = r.filter((x) => x.metric_key.toLowerCase().includes(filter.toLowerCase()));
    return r;
  }, [rows, filter, statusFilter]);

  if (loading) return <Loader msg={progress || "Loading usage data..."} />;

  const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp);
  const idleRows = rows.filter((r) => r.status === "idle");
  const rareRows = rows.filter((r) => r.status === "rare");
  const idleSeries = idleRows.reduce((a, r) => a + r.series, 0);
  const idleAnnual = dailyCostPerSeries * idleSeries * 365;
  const totalSeries = rows.reduce((a, r) => a + r.series, 0);
  const idleSharePct = totalSeries > 0 ? (idleSeries / totalSeries) * 100 : 0;
  const rareAnnual = dailyCostPerSeries * rareRows.reduce((a, r) => a + r.series, 0) * 365;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Stat label="Idle metrics" value={fmtNum(idleRows.length)}
              sub={`Never queried in ${LOOKBACK_DAYS}d`} />
        <Stat label="Series in idle metrics" value={fmtNum(idleSeries)}
              sub={`${idleSharePct.toFixed(1)}% of all series`} />
        <Stat label="Idle annual cost" value={fmtUSD(idleAnnual)}
              sub="Potential savings if dropped" />
        <Stat label="Rarely queried (1–2 queries)" value={fmtNum(rareRows.length)}
              sub={`${fmtUSD(rareAnnual)}/yr`} />
        <Stat label="Active" value={fmtNum(rows.length - idleRows.length - rareRows.length)} />
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Filter metric keys..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={inputStyle}>
            <option value="idle">Idle only</option>
            <option value="rare">Rarely queried only</option>
            <option value="active">Active only</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => setRefreshTick((t) => t + 1)} style={btnSec}>Refresh</button>
          <button onClick={() => downloadCsv(filtered, rateCentsPerDp)} style={btnSec}>Export CSV</button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{filtered.length} matches</span>
        </div>
      </Card>

      <Card title={`${statusFilter === "idle" ? "Idle" : statusFilter === "rare" ? "Rarely-queried" : statusFilter === "active" ? "Active" : "All"} metrics`}>
        <SortableTable
          columns={[
            { key: "status", header: "Status", render: (r: UsageRow) => <Badge status={r.status} />, sortValue: (r: UsageRow) => r.status },
            { key: "metric_key", header: "Metric key", render: (r: UsageRow) => <code>{r.metric_key}</code>, sortValue: (r: UsageRow) => r.metric_key },
            { key: "series", header: "Series", align: "right", render: (r: UsageRow) => fmtNum(r.series), sortValue: (r: UsageRow) => r.series },
            { key: "queries", header: `Queries / ${LOOKBACK_DAYS}d`, align: "right", render: (r: UsageRow) => r.queryCount === 0 ? <span style={{ opacity: 0.5 }}>—</span> : fmtNum(r.queryCount), sortValue: (r: UsageRow) => r.queryCount },
            { key: "annual", header: "Annual cost", align: "right", render: (r: UsageRow) => {
              const annual = dailyCostPerSeries * r.series * 365;
              return <span style={{ fontWeight: 600, color: r.status === "idle" ? "#ff6b35" : undefined }}>{fmtUSD(annual)}</span>;
            }, sortValue: (r: UsageRow) => r.series },
          ]}
          data={filtered}
          rowKey={(r) => r.metric_key}
          maxRows={500}
          defaultSortKey="series"
          defaultSortDir="desc"
        />
      </Card>

      <Card>
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          <strong>Method:</strong> An "idle" metric appears in <code>metric.series</code> ingest but its name is not referenced by any DQL query executed in the last {LOOKBACK_DAYS} days (per <code>dt.system.events QUERY_EXECUTION_EVENT</code>, table = metrics).
          Match is a case-insensitive substring of the query text — so this slightly OVER-counts queries that mention the name in a comment, and may MISS metrics referenced indirectly via dashboard variables. Cost basis: {ASSUMED_DP_PER_SERIES_PER_DAY} DP/series/day × {rateCentsPerDp}¢/DP.
        </div>
      </Card>
    </div>
  );
};

const Badge: React.FC<{ status: "idle" | "rare" | "active" }> = ({ status }) => {
  const map: Record<string, { bg: string; label: string }> = {
    idle:   { bg: "#ff6b35", label: "IDLE" },
    rare:   { bg: "#f59e0b", label: "RARE" },
    active: { bg: "#10b981", label: "ACTIVE" },
  };
  const m = map[status];
  return (
    <span style={{
      fontSize: 10, padding: "1px 8px", background: m.bg, color: "#fff",
      borderRadius: 3, fontWeight: 600, letterSpacing: 0.5,
    }}>{m.label}</span>
  );
};

function downloadCsv(rows: UsageRow[], rate: number) {
  const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rate);
  const header = ["status", "metric_key", "series", "queries_30d", "annual_cost_usd"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const annual = dailyCostPerSeries * r.series * 365;
    lines.push([r.status, `"${r.metric_key}"`, r.series, r.queryCount, annual.toFixed(6)].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metric-usage-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
