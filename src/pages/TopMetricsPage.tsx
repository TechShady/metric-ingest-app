import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable, Column } from "../components/SortableTable";
import { LineChart } from "../components/LineChart";
import { BarList } from "../components/BarList";
import {
  fetchAllMetricCardinality,
  fetchTotalIngestSeries,
  MetricKeyRow,
  fetchMetricDailyDatapoints,
  fetchMetricBySource,
} from "../lib/queries";
import { fmtNum, linearForecast } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

interface Props { timeframe: string; }

// metric.series only reliably supports up to ~7d; cap longer windows
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

const ASSUMED_DP_PER_SERIES_PER_DAY = 1440;

/** Interval label for SFM timeseries query based on timeframe. */
function intervalForTf(tf: string): string {
  if (tf.includes("1h")) return "1m";
  if (tf.includes("6h")) return "5m";
  if (tf.includes("1d")) return "30m";
  if (tf.includes("7d")) return "1h";
  if (tf.includes("14d")) return "3h";
  if (tf.includes("30d")) return "6h";
  return "1h";
}

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

export const TopMetricsPage: React.FC<Props> = ({ timeframe }) => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string>("");
  const [rows, setRows] = useState<MetricKeyRow[]>([]);
  const [sfmTotalDp, setSfmTotalDp] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);

  const days = timeframeDays(timeframe);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    const { capped: tf, wasCapped } = capTimeframe(timeframe);
    setCapped(wasCapped);
    setProgress(`Querying metric cardinality over ${tf}${wasCapped ? " (capped from " + timeframe + ")" : ""} (chunked by prefix)...`);
    (async () => {
      const [r, sfm] = await Promise.all([
        fetchAllMetricCardinality(tf),
        fetchTotalIngestSeries(timeframe, intervalForTf(timeframe)),
      ]);
      if (abort) return;
      setRows(r);
      if (sfm) {
        const total = sfm.values.reduce((a, b) => a + b, 0);
        setSfmTotalDp(total);
      }
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [timeframe]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((x) => x.metric_key.toLowerCase().includes(filter.toLowerCase()));
  }, [rows, filter]);

  const totalSeries = rows.reduce((a, b) => a + b.series, 0);
  const useSfm = sfmTotalDp != null && sfmTotalDp > 0 && totalSeries > 0;
  const totalDpInPeriod = useSfm ? sfmTotalDp! : rows.reduce((a, b) => a + b.series * ASSUMED_DP_PER_SERIES_PER_DAY * days, 0);
  const totalDailyDp = totalDpInPeriod / Math.max(1, days);
  const totalDailyCost = costUSD(totalDailyDp, rateCentsPerDp);

  const dpForRow = (r: MetricKeyRow) =>
    useSfm
      ? (r.series / totalSeries) * totalDailyDp
      : r.estDailyDatapoints;

  const filteredDailyDp = filtered.reduce((a, b) => a + dpForRow(b), 0);
  const filteredDailyCost = costUSD(filteredDailyDp, rateCentsPerDp);
  const filteredMonthlyCost = filteredDailyCost * 30;
  const filteredAnnualCost = filteredDailyCost * 365;

  const columns = useMemo((): Column<MetricKeyRow>[] => [
    { key: "name", header: "Metric key", render: (r) => <code>{r.metric_key}</code>, sortValue: (r) => r.metric_key },
    { key: "series", header: "Series", align: "right", render: (r) => fmtNum(r.series), sortValue: (r) => r.series },
    { key: "dp", header: "Est. DP/day", align: "right", render: (r) => fmtNum(dpForRow(r)), sortValue: (r) => dpForRow(r) },
    { key: "cost", header: "Est. $/month", align: "right", render: (r) => fmtUSD(costUSD(dpForRow(r), rateCentsPerDp) * 30), sortValue: (r) => dpForRow(r) },
    { key: "pct", header: "% of total", align: "right", render: (r) => `${totalSeries > 0 ? ((r.series / totalSeries) * 100).toFixed(2) : "0"}%`, sortValue: (r) => r.series },
  ], [totalSeries, rateCentsPerDp, useSfm, totalDailyDp]);

  if (loading) return <Loader msg={progress} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {capped && (
        <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, fontSize: 12 }}>
          Timeframe capped to 7 days — <code>metric.series</code> does not reliably support longer windows. Use <strong>Cost Forecast</strong> or <strong>Forecast Top N</strong> for 30-day historical analysis.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Distinct metric keys" value={String(rows.length)} />
        <Stat label="Total series" value={fmtNum(totalSeries)} />
        <Stat label="Est. datapoints / day"
              value={fmtNum(totalDailyDp)}
              sub={`Cost: ${fmtUSD(totalDailyCost)}/day`} />
        <Stat label="Est. monthly cost"
              value={fmtUSD(totalDailyCost * 30)}
              sub={`${fmtUSD(totalDailyCost * 365)}/yr`} />
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            placeholder="Filter metric keys..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1, padding: "6px 10px",
              background: "rgba(128,128,128,0.1)",
              border: "1px solid rgba(128,128,128,0.3)",
              borderRadius: 4, color: "inherit",
            }}
          />
          <span style={{ fontSize: 12, opacity: 0.7 }}>{filtered.length} matches</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1496ff" }}>
            Filtered cost: {fmtUSD(filteredMonthlyCost)}/mo ({fmtUSD(filteredAnnualCost)}/yr)
          </span>
        </div>

        <SortableTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.metric_key}
          maxHeight={480}
          maxRows={500}
          onRowClick={(r) => setSelected(r.metric_key)}
          rowStyle={(r) => ({
            background: selected === r.metric_key ? "rgba(20,150,255,0.12)" : undefined,
          })}
          defaultSortKey="series"
          defaultSortDir="desc"
        />
      </Card>

      {selected && <MetricDetail metricKey={selected} timeframe={timeframe} onClose={() => setSelected(null)} />}
    </div>
  );
};

const MetricDetail: React.FC<{ metricKey: string; timeframe: string; onClose: () => void }> = ({
  metricKey, timeframe, onClose,
}) => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<{ values: number[]; total: number }>({ values: [], total: 0 });
  const [bySource, setBySource] = useState<{ source: string; series: number }[]>([]);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const [d, s] = await Promise.all([
        fetchMetricDailyDatapoints(metricKey, "now()-30d"),
        fetchMetricBySource(metricKey, "now()-2h"),
      ]);
      if (abort) return;
      setDaily(d); setBySource(s); setLoading(false);
    })();
    return () => { abort = true; };
  }, [metricKey]);

  const fc = useMemo(() => linearForecast(daily.values, 14), [daily.values]);
  const sourceTotal = bySource.reduce((a, b) => a + b.series, 0);

  return (
    <Card title={`Detail: ${metricKey}`}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>30-day datapoints + 14-day forecast</div>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(128,128,128,0.4)",
                color: "inherit", borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 12 }}>
          Close
        </button>
      </div>
      {loading ? <Loader /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Stat label="Datapoints (30d)" value={fmtNum(daily.total)} sub={`Cost: ${fmtUSD(costUSD(daily.total, rateCentsPerDp))}`} />
            <Stat label="Avg / day" value={fmtNum(daily.values.length ? daily.total / daily.values.length : 0)} sub={`${fmtUSD(costUSD(daily.values.length ? daily.total / daily.values.length : 0, rateCentsPerDp))}/day`} />
            <Stat label="Daily trend"
                  value={`${fc.slope >= 0 ? "+" : ""}${fmtNum(fc.slope)}/d`}
                  sub={`R²=${fc.r2.toFixed(2)}`} />
            <Stat label="Forecast in 14d" value={fmtNum(fc.forecast[fc.forecast.length - 1] ?? 0)} sub={`${fmtUSD(costUSD(fc.forecast[fc.forecast.length - 1] ?? 0, rateCentsPerDp))}/day`} />
            <Stat label="Est. monthly cost" value={fmtUSD(costUSD(daily.values.length ? (daily.total / daily.values.length) * 30 : 0, rateCentsPerDp))} />
          </div>
          <LineChart
            history={fc.history}
            forecast={fc.forecast}
            upper={fc.upper}
            lower={fc.lower}
            yLabel="datapoints / day"
          />
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Series by source</div>
            {bySource.length ? (
              <BarList rows={bySource.slice(0, 10).map((s) => ({
                label: s.source, value: s.series,
                pct: sourceTotal > 0 ? (s.series / sourceTotal) * 100 : 0,
              }))} />
            ) : <div style={{ opacity: 0.7, fontSize: 12 }}>No source breakdown available.</div>}
          </div>
        </>
      )}
    </Card>
  );
};
