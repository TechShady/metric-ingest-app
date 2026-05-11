import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable, Column } from "../components/SortableTable";
import { LineChart } from "../components/LineChart";
import { BarList } from "../components/BarList";
import {
  fetchAllMetricCardinality,
  MetricKeyRow,
  fetchMetricDailyDatapoints,
  fetchMetricBySource,
} from "../lib/queries";
import { fmtNum, linearForecast } from "../lib/forecast";

interface Props { timeframe: string; }

export const TopMetricsPage: React.FC<Props> = ({ timeframe }) => {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string>("");
  const [rows, setRows] = useState<MetricKeyRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setProgress(`Querying metric cardinality over ${timeframe} (chunked by prefix)...`);
    (async () => {
      const r = await fetchAllMetricCardinality(timeframe);
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

  const totalSeries = rows.reduce((a, b) => a + b.series, 0);
  const totalEst = rows.reduce((a, b) => a + b.estDailyDatapoints, 0);

  const columns = useMemo((): Column<MetricKeyRow>[] => [
    { key: "name", header: "Metric key", render: (r) => <code>{r.metric_key}</code>, sortValue: (r) => r.metric_key },
    { key: "series", header: "Series", align: "right", render: (r) => fmtNum(r.series), sortValue: (r) => r.series },
    { key: "dp", header: "Est. DP/day", align: "right", render: (r) => fmtNum(r.estDailyDatapoints), sortValue: (r) => r.estDailyDatapoints },
    { key: "pct", header: "% of total", align: "right", render: (r) => `${totalSeries > 0 ? ((r.series / totalSeries) * 100).toFixed(2) : "0"}%`, sortValue: (r) => r.series },
  ], [totalSeries]);

  if (loading) return <Loader msg={progress} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Stat label="Distinct metric keys" value={String(rows.length)} />
        <Stat label="Total series" value={fmtNum(totalSeries)} />
        <Stat label="Est. datapoints / day"
              value={fmtNum(totalEst)}
              sub="series × 1440 (1-min resolution heuristic)" />
        <Stat label="Top metric"
              value={rows[0]?.metric_key.slice(0, 24) + (rows[0]?.metric_key.length > 24 ? "…" : "")}
              sub={`${fmtNum(rows[0]?.series ?? 0)} series`} />
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
            <Stat label="Datapoints (30d)" value={fmtNum(daily.total)} />
            <Stat label="Avg / day" value={fmtNum(daily.values.length ? daily.total / daily.values.length : 0)} />
            <Stat label="Daily trend"
                  value={`${fc.slope >= 0 ? "+" : ""}${fmtNum(fc.slope)}/d`}
                  sub={`R²=${fc.r2.toFixed(2)}`} />
            <Stat label="Forecast in 14d" value={fmtNum(fc.forecast[fc.forecast.length - 1] ?? 0)} />
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
