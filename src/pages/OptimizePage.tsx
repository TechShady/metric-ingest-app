import React, { useEffect, useMemo, useState } from "react";
import { Card, Loader, Stat } from "../components/Common";
import { SortableTable } from "../components/SortableTable";
import { BarList } from "../components/BarList";
import { fetchAllMetricCardinality, fetchAllSeriesFor, MetricKeyRow } from "../lib/queries";
import { fmtNum } from "../lib/forecast";
import { costUSD, fmtUSD } from "../lib/cost";
import { useSettings } from "../state/SettingsContext";

const ASSUMED_DP_PER_SERIES_PER_DAY = 1440; // 1-min resolution heuristic

interface DimStat {
  field: string;
  distinct: number;
  fillRate: number; // fraction of series where dim is non-null
  topValues: { value: string; count: number }[];
}

export const OptimizePage: React.FC = () => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [allMetrics, setAllMetrics] = useState<MetricKeyRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const r = await fetchAllMetricCardinality("now()-2h");
      if (abort) return;
      setAllMetrics(r);
      if (r.length) setSelected(r[0].metric_key);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return allMetrics;
    const f = filter.toLowerCase();
    return allMetrics.filter((m) => m.metric_key.toLowerCase().includes(f));
  }, [allMetrics, filter]);

  // What-if totals
  const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp);
  const totalSeriesAll = allMetrics.reduce((a, m) => a + m.series, 0);
  const droppedSeries = allMetrics
    .filter((m) => dropped.has(m.metric_key))
    .reduce((a, m) => a + m.series, 0);
  const remainingSeries = totalSeriesAll - droppedSeries;
  const annualSavings = dailyCostPerSeries * droppedSeries * 365;
  const monthlySavings = dailyCostPerSeries * droppedSeries * 30;
  const annualTotal = dailyCostPerSeries * totalSeriesAll * 365;
  const annualRemaining = dailyCostPerSeries * remainingSeries * 365;
  const savingsPct = annualTotal > 0 ? (annualSavings / annualTotal) * 100 : 0;

  if (loading) return <Loader msg="Loading metric cardinality..." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* What-if simulator */}
      <Card title='"What if I drop these?" simulator'>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
          <Stat label="Selected to drop" value={String(dropped.size)} sub={`${fmtNum(droppedSeries)} series`} />
          <Stat label="Remaining series" value={fmtNum(remainingSeries)}
                sub={`of ${fmtNum(totalSeriesAll)} total`} />
          <Stat label="Monthly savings" value={fmtUSD(monthlySavings)} />
          <Stat label="Annual savings" value={fmtUSD(annualSavings)}
                sub={`${savingsPct.toFixed(1)}% of $${annualTotal.toFixed(0)}`} />
          <Stat label="Annual cost after" value={fmtUSD(annualRemaining)} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <button onClick={() => setDropped(new Set())} style={btnSec}>Clear selection</button>
          <button
            onClick={() => {
              const next = new Set<string>();
              filtered.slice(0, 10).forEach((m) => next.add(m.metric_key));
              setDropped(next);
            }}
            style={btnSec}
          >
            Select top 10 (filtered)
          </button>
          <span style={{ fontSize: 11, opacity: 0.65, marginLeft: "auto" }}>
            Cost basis: {ASSUMED_DP_PER_SERIES_PER_DAY} DP/series/day × {rateCentsPerDp}¢/DP
          </span>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        {/* Metric picker with checkboxes */}
        <Card title={`Metrics (${allMetrics.length})`}>
          <input
            placeholder="Filter metric keys..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
          />
          <div style={{ maxHeight: 600, overflowY: "auto", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 4 }}>
            {filtered.slice(0, 300).map((m) => {
              const annual = dailyCostPerSeries * m.series * 365;
              const isSel = selected === m.metric_key;
              const isDropped = dropped.has(m.metric_key);
              return (
                <div
                  key={m.metric_key}
                  style={{
                    padding: "6px 10px",
                    background: isSel ? "rgba(20,150,255,0.12)" : "transparent",
                    borderBottom: "1px solid rgba(128,128,128,0.15)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isDropped}
                    onChange={(e) => {
                      const next = new Set(dropped);
                      if (e.target.checked) next.add(m.metric_key);
                      else next.delete(m.metric_key);
                      setDropped(next);
                    }}
                    title="Mark as dropped (what-if)"
                  />
                  <div
                    onClick={() => setSelected(m.metric_key)}
                    style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                  >
                    <div style={{
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textDecoration: isDropped ? "line-through" : "none",
                      opacity: isDropped ? 0.5 : 1,
                    }}>
                      <code>{m.metric_key}</code>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7 }}>
                      <span>{fmtNum(m.series)} series</span>
                      <span>{fmtUSD(annual)}/yr</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length > 300 && (
              <div style={{ padding: 8, fontSize: 11, opacity: 0.7, textAlign: "center" }}>
                Showing first 300 of {filtered.length}. Use filter to narrow.
              </div>
            )}
          </div>
        </Card>

        {/* Dimension explorer */}
        <Card title={selected ? `Dimension cardinality: ${selected}` : "Select a metric"}>
          {selected && <DimensionExplorer metricKey={selected} />}
        </Card>
      </div>
    </div>
  );
};

const DimensionExplorer: React.FC<{ metricKey: string }> = ({ metricKey }) => {
  const { rateCentsPerDp } = useSettings();
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<any[]>([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      const recs = await fetchAllSeriesFor(metricKey, "now()-2h", 100000);
      if (abort) return;
      setSeries(recs);
      setTruncated(recs.length === 100000);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [metricKey]);

  const stats: DimStat[] = useMemo(() => {
    if (!series.length) return [];
    // Discover field names (excluding metric.key itself which is constant)
    const fields = new Set<string>();
    for (const s of series) {
      for (const k of Object.keys(s)) {
        if (k === "metric.key") continue;
        fields.add(k);
      }
    }
    const out: DimStat[] = [];
    for (const f of fields) {
      const counts = new Map<string, number>();
      let nonNull = 0;
      for (const s of series) {
        const v = s[f];
        if (v == null || v === "") continue;
        nonNull++;
        const sv = String(v);
        counts.set(sv, (counts.get(sv) ?? 0) + 1);
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
      out.push({
        field: f,
        distinct: counts.size,
        fillRate: series.length > 0 ? nonNull / series.length : 0,
        topValues: top,
      });
    }
    out.sort((a, b) => b.distinct - a.distinct);
    return out;
  }, [series]);

  if (loading) return <Loader msg="Fetching all series for this metric..." />;
  if (!series.length) return <div style={{ opacity: 0.7 }}>No series found.</div>;

  const totalSeries = series.length;
  const dailyCostPerSeries = costUSD(ASSUMED_DP_PER_SERIES_PER_DAY, rateCentsPerDp);
  const annualCost = dailyCostPerSeries * totalSeries * 365;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
        <Stat label="Series" value={fmtNum(totalSeries)}
              sub={truncated ? "⚠ truncated at 100k" : "complete"} />
        <Stat label="Dimensions" value={String(stats.length)} />
        <Stat label="Annual cost (this metric)" value={fmtUSD(annualCost)} />
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
        Cardinality of each dimension. <strong>If you removed a high-cardinality dimension</strong>, series count would collapse to roughly the number of distinct combinations of remaining dimensions. Look for dims with high distinct count and high fill rate — they drive cost.
      </div>

      <SortableTable
        columns={[
          { key: "field", header: "Dimension", render: (d: DimStat) => {
            const isHotspot = d.distinct > 50 && d.fillRate > 0.5;
            return <><code>{d.field}</code>{isHotspot && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", background: "#ff6b35", color: "#fff", borderRadius: 3 }}>hotspot</span>}</>;
          }, sortValue: (d: DimStat) => d.field },
          { key: "distinct", header: "Distinct values", align: "right", render: (d: DimStat) => <span style={{ fontWeight: 600 }}>{fmtNum(d.distinct)}</span>, sortValue: (d: DimStat) => d.distinct },
          { key: "fillRate", header: "Fill rate", align: "right", render: (d: DimStat) => `${(d.fillRate * 100).toFixed(0)}%`, sortValue: (d: DimStat) => d.fillRate },
          { key: "ifRemoved", header: "If removed", align: "right", render: (d: DimStat) => {
            const collapseFactor = d.distinct > 0 ? 1 / d.distinct : 1;
            const newSeriesEstimate = Math.ceil(totalSeries * collapseFactor);
            const savings = annualCost - dailyCostPerSeries * newSeriesEstimate * 365;
            return <span title="Upper-bound estimate">~{fmtNum(newSeriesEstimate)} series<div style={{ fontSize: 10, opacity: 0.7 }}>\u2264 {fmtUSD(savings)}/yr saved</div></span>;
          }, sortValue: (d: DimStat) => d.distinct },
          { key: "topValues", header: "Top values", render: (d: DimStat) => <div style={{ fontSize: 11, opacity: 0.85 }}>{d.topValues.map((t) => (
            <div key={t.value} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
              <code>{t.value.length > 50 ? t.value.slice(0, 50) + "\u2026" : t.value}</code>
              <span style={{ opacity: 0.6, marginLeft: 4 }}>({t.count})</span>
            </div>
          ))}</div> },
        ]}
        data={stats}
        rowKey={(d) => d.field}
        maxHeight={500}
        fontSize={12}
        defaultSortKey="distinct"
        defaultSortDir="desc"
        rowStyle={(d) => ({
          background: d.distinct > 50 && d.fillRate > 0.5 ? "rgba(255,107,53,0.07)" : undefined,
        })}
      />

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top dimension hotspots</div>
        <BarList
          rows={stats.slice(0, 8).map((d) => ({
            label: d.field,
            value: d.distinct,
            pct: totalSeries > 0 ? (d.distinct / totalSeries) * 100 : 0,
          }))}
        />
      </div>
    </>
  );
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(128,128,128,0.1)",
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 12,
  boxSizing: "border-box",
};
const btnSec: React.CSSProperties = {
  padding: "4px 12px",
  background: "transparent",
  border: "1px solid rgba(128,128,128,0.4)",
  borderRadius: 4,
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};
