import React, { useState } from "react";
import { Page } from "@dynatrace/strato-components-preview/layouts";
import { OverviewPage } from "../pages/OverviewPage";
import { TopMetricsPage } from "../pages/TopMetricsPage";
import { SourcesPage } from "../pages/SourcesPage";
import { ForecastPage } from "../pages/ForecastPage";
import { ForecastTopNPage } from "../pages/ForecastTopNPage";
import { CostForecastPage } from "../pages/CostForecastPage";
import { OptimizePage } from "../pages/OptimizePage";
import { UsagePage } from "../pages/UsagePage";
import { DiffPage } from "../pages/DiffPage";
import { SettingsProvider, useSettings } from "../state/SettingsContext";
import { SettingsModal } from "../components/SettingsModal";
import { DEFAULT_RATE_CENTS_PER_DP } from "../lib/cost";

type Tab =
  | "overview"
  | "metrics"
  | "sources"
  | "usage"
  | "diff"
  | "forecast"
  | "forecastTopN"
  | "costForecast"
  | "optimize";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "metrics", label: "Top Metrics" },
  { id: "sources", label: "Sources" },
  { id: "usage", label: "Idle Metrics" },
  { id: "diff", label: "Weekly Diff" },
  { id: "forecast", label: "Forecast Overall" },
  { id: "forecastTopN", label: "Forecast Top N Metrics" },
  { id: "costForecast", label: "Cost Forecast" },
  { id: "optimize", label: "Optimize" },
];

const Shell: React.FC = () => {
  const [tab, setTab] = useState<Tab>("overview");
  const [timeframe, setTimeframe] = useState<string>("now()-7d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { topN, rateCentsPerDp } = useSettings();

  return (
    <Page>
      <Page.Main>
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Metric Ingest Insights</h1>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Understand metric storage / ingest cost — by metric key, source, and forecast.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Timeframe:</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    background: "rgba(128,128,128,0.1)",
                    border: "1px solid rgba(128,128,128,0.3)",
                    borderRadius: 4,
                    color: "inherit",
                  }}
                >
                  <option value="now()-1h">Last 1 hour</option>
                  <option value="now()-6h">Last 6 hours</option>
                  <option value="now()-1d">Last 1 day</option>
                  <option value="now()-7d">Last 7 days</option>
                  <option value="now()-14d">Last 14 days</option>
                  <option value="now()-30d">Last 30 days</option>
                </select>
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                title={`Settings — Top N=${topN}, Cost=${rateCentsPerDp}¢/DP`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  background: "rgba(128,128,128,0.1)",
                  border: "1px solid rgba(128,128,128,0.3)",
                  borderRadius: 4,
                  color: "inherit",
                  cursor: "pointer",
                }}
                aria-label="Settings"
              >
                <GearIcon />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(128,128,128,0.3)", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === t.id ? "2px solid #1496ff" : "2px solid transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontWeight: tab === t.id ? 600 : 400,
                  fontSize: 14,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            {tab === "overview" && <OverviewPage timeframe={timeframe} />}
            {tab === "metrics" && <TopMetricsPage timeframe={timeframe} />}
            {tab === "sources" && <SourcesPage timeframe={timeframe} />}
            {tab === "usage" && <UsagePage />}
            {tab === "diff" && <DiffPage />}
            {tab === "forecast" && <ForecastPage timeframe={timeframe} />}
            {tab === "forecastTopN" && <ForecastTopNPage topN={topN} />}
            {tab === "costForecast" && <CostForecastPage topN={topN} />}
            {tab === "optimize" && <OptimizePage />}
          </div>
        </div>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </Page.Main>
    </Page>
  );
};

const GearIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const App: React.FC = () => (
  <SettingsProvider defaultTopN={20} defaultRateCentsPerDp={DEFAULT_RATE_CENTS_PER_DP} defaultMonthlyBudgetUSD={0}>
    <Shell />
  </SettingsProvider>
);
