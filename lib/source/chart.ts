import type { Provenance } from "@/lib/domain/provenance";
import {
  getChartSeries as getAlphaVantageChartSeries,
  type ChartRange,
  type ChartSeries,
} from "./alpha-vantage";
import { getTwelveDataChartSeries } from "./twelve-data";

export type { ChartPoint, ChartRange, ChartSeries } from "./alpha-vantage";

type ChartResult = {
  data: ChartSeries;
  provenance: Provenance;
  cached: boolean;
};

/**
 * Twelve Data is the primary chart provider because its Basic plan supports
 * intraday bars. Alpha Vantage remains a best-effort fallback for deployments
 * that have an entitled key, particularly for daily and weekly history.
 */
export async function getChartSeries(
  ticker: string,
  range: ChartRange,
  ctx: { researchRunId?: number } = {},
): Promise<ChartResult> {
  const errors: string[] = [];
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      return await getTwelveDataChartSeries(ticker, range, ctx);
    } catch (error) {
      errors.push(`Twelve Data: ${(error as Error).message}`);
    }
  }
  if (process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      return await getAlphaVantageChartSeries(ticker, range, ctx);
    } catch (error) {
      errors.push(`Alpha Vantage: ${(error as Error).message}`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
  throw new Error("No chart provider is configured");
}
