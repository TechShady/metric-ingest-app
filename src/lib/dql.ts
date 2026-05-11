import { queryExecutionClient } from "@dynatrace-sdk/client-query";

export type Record = Record_<string, any>;
type Record_<K extends string, V> = { [P in K]: V };

export async function runDql(query: string, opts: { maxRecords?: number } = {}): Promise<any[]> {
  const maxResultRecords = opts.maxRecords ?? 100000;
  try {
    let r = await queryExecutionClient.queryExecute({
      body: {
        query,
        requestTimeoutMilliseconds: 60000,
        maxResultRecords,
        defaultSamplingRatio: 1,
      } as any,
    });
    while ((r.state === "RUNNING" || r.state === "NOT_STARTED") && r.requestToken) {
      await new Promise((res) => setTimeout(res, 1000));
      r = await queryExecutionClient.queryPoll({
        requestToken: r.requestToken,
        requestTimeoutMilliseconds: 60000,
      });
    }
    if (r.state !== "SUCCEEDED") {
      console.warn("[DQL] non-success state", r.state, query.slice(0, 120));
      return [];
    }
    const recs = r.result?.records ?? [];
    console.log(`[DQL] ${query.split("\n")[0].slice(0, 80)} -> ${recs.length} rec`);
    return recs;
  } catch (e) {
    console.error("[DQL] query failed:", query.slice(0, 120), e);
    return [];
  }
}

/**
 * Run multiple DQL queries in parallel chunks and merge their results.
 * Each chunk is a query string; results are concatenated.
 */
export async function runDqlChunks(queries: string[], concurrency = 4): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((q) => runDql(q).catch((e) => {
      console.warn("[DQL chunk] failed", e);
      return [];
    })));
    for (const r of results) out.push(...r);
  }
  return out;
}

export const N = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};
