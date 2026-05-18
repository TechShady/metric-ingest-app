# DISCLAIMER
This project was created by myself, an SE of Dynatrace. This is not an official Dynatrace application and it is not something you can open a support ticket on. You may create an issue on the github repository, however there is no guaruntee it will be addressed (this isn't my primary job, just a fun project). Feel free to fork the repository for your own use as well.

# Metric Ingest Insights

A standalone Dynatrace app that helps you understand metric storage / ingest cost.

## Tabs

- **Overview** — total ingested datapoints, breakdown by source & channel, time series.
- **Top Metrics** — cardinality of every metric key (chunked DQL, no row limits) with estimated daily datapoint volume. Click a metric for 30-day history + 14-day linear forecast and source breakdown.
- **Sources** — per-source ingest volume time series, click a source to forecast its trend.
- **Forecast** — linear regression forecast of total metric ingest volume with 95% prediction interval. Configurable history & horizon.

## DQL

All queries are validated against the Demo Live tenant. Key sources:

- `dt.sfm.server.metrics.ingest.external_datapoints` — actual ingested datapoints (custom metrics, OTLP, extensions).
- `fetch metric.series` — per-metric.key series cardinality. To bypass `metric.series` row caps, the app issues one query per metric-key prefix (`dt.`, `a`–`z`, `0`–`9`, `_`) in parallel and merges results in the client.
- `count(<metric.key>)` in `timeseries` for per-metric daily datapoint counts (drill-down).

## Forecast

`timeseries_predict` is not available in this tenant, so forecasting is computed client-side using ordinary least-squares linear regression with a 95% prediction interval (+/-1.96 * stddev, scaled by leverage). For strongly seasonal metrics the model is conservative — treat as a trend indicator.

## Build / deploy

```powershell
cd metric-ingest-app
npm install --legacy-peer-deps
npx dt-app analyze    # validate config + bundle
npx dt-app deploy     # upload to tenant
```
