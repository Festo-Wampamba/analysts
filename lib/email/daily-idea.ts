import type { EmailMessage } from "./resend";
import type { DailyIdeaPayload } from "@/lib/screen/types";

// Email clients strip <style> unpredictably, so the layout stays inline and
// table-free: a plain single-column document that degrades to readable text.

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const formatPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${formatNumber(value)}%`;

export function renderDailyIdeaEmail(
  idea: DailyIdeaPayload,
  tradingDate: string,
): EmailMessage {
  const { facts, narrative, generated } = idea;
  const name = facts.company?.name ?? facts.ticker;
  const subject = `Daily stock idea — ${facts.ticker} (${tradingDate})`;

  const priceLine = facts.price
    ? `${formatNumber(facts.price.current)} ${facts.company?.currency ?? "USD"} (${formatPercent(facts.price.changePercent)} vs previous close)`
    : "price unavailable at generation time";

  const marketCapLine =
    facts.company?.marketCapMillions !== undefined
      ? `${formatNumber(facts.company.marketCapMillions / 1000, 1)}B ${facts.company.currency ?? "USD"} market cap`
      : "market cap unavailable";

  const valuationLine =
    facts.metrics.peTTM !== undefined
      ? facts.sectorMedianPe !== undefined
        ? `P/E ${formatNumber(facts.metrics.peTTM)} vs sector median ${formatNumber(facts.sectorMedianPe)}`
        : `P/E ${formatNumber(facts.metrics.peTTM)} (no sector peer median available)`
      : "P/E unavailable";

  const metricLines = Object.entries(facts.metrics).map(
    ([key, value]) => `${key}: ${formatNumber(value)}`,
  );

  const sourceLines = [
    "Finnhub — quote, company profile, key metrics, analyst recommendations, insider transactions, company news",
    ...(facts.news ?? []).map((item) => `${item.source} (${item.date}): ${item.url}`),
  ];

  const text = [
    `${name} (${facts.ticker})`,
    priceLine,
    marketCapLine,
    "",
    `Composite score ${formatNumber(facts.compositeScore * 100, 1)} / 100 (threshold ${formatNumber(facts.threshold * 100, 1)}), confidence ${formatNumber(facts.coverage * 100, 1)}% data coverage, ranked against ${facts.universeEvaluated} evaluated companies.`,
    "",
    "WHY IT WAS SELECTED",
    narrative.selectionReason,
    "",
    "INVESTMENT THESIS",
    ...narrative.thesisPoints.map((point, i) => `${i + 1}. ${point}`),
    "",
    "KEY METRICS",
    ...metricLines,
    "",
    "VALUATION VS PEERS",
    valuationLine,
    "",
    "RECENT CATALYST",
    narrative.keyCatalyst,
    "",
    "BULL CASE",
    narrative.bullCase,
    "",
    "BEAR CASE",
    narrative.bearCase,
    "",
    "PRINCIPAL RISKS",
    ...narrative.risks.map((risk) => `- ${risk}`),
    "",
    "CONFIDENCE",
    narrative.confidenceRationale,
    "",
    "SOURCES",
    ...sourceLines,
    "",
    `Generated ${generated.generatedAt} by ${generated.modelLabel ?? "the configured model"}.`,
    "Screening output and AI-written analysis. Not investment advice.",
  ].join("\n");

  const p = (content: string) =>
    `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(content)}</p>`;
  const h = (content: string) =>
    `<h2 style="margin:24px 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">${escapeHtml(content)}</h2>`;

  const html = `<div style="max-width:640px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;font-size:15px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">Daily stock idea · ${escapeHtml(tradingDate)}</p>
  <h1 style="margin:0 0 4px;font-size:24px">${escapeHtml(name)} <span style="color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(facts.ticker)}</span></h1>
  <p style="margin:0 0 2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(priceLine)}</p>
  <p style="margin:0 0 16px;color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(marketCapLine)}</p>
  <p style="margin:0 0 16px;padding:12px;background:#f1f5f9;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px">Composite ${formatNumber(facts.compositeScore * 100, 1)}/100 · threshold ${formatNumber(facts.threshold * 100, 1)} · confidence ${formatNumber(facts.coverage * 100, 1)}% coverage · ${facts.universeEvaluated} companies evaluated</p>
  ${h("Why it was selected")}${p(narrative.selectionReason)}
  ${h("Investment thesis")}<ol style="margin:0 0 12px;padding-left:20px;line-height:1.55">${narrative.thesisPoints.map((point) => `<li style="margin-bottom:6px">${escapeHtml(point)}</li>`).join("")}</ol>
  ${h("Key metrics")}<p style="margin:0 0 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.7">${metricLines.map(escapeHtml).join("<br>")}</p>
  ${h("Valuation vs peers")}${p(valuationLine)}
  ${h("Recent catalyst")}${p(narrative.keyCatalyst)}
  ${h("Bull case")}${p(narrative.bullCase)}
  ${h("Bear case")}${p(narrative.bearCase)}
  ${h("Principal risks")}<ul style="margin:0 0 12px;padding-left:20px;line-height:1.55">${narrative.risks.map((risk) => `<li style="margin-bottom:6px">${escapeHtml(risk)}</li>`).join("")}</ul>
  ${h("Confidence")}${p(narrative.confidenceRationale)}
  ${h("Sources")}<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#475569">${sourceLines.map(escapeHtml).join("<br>")}</p>
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Generated ${escapeHtml(generated.generatedAt)} by ${escapeHtml(generated.modelLabel ?? "the configured model")}. Screening output and AI-written analysis. Not investment advice.</p>
</div>`;

  return { subject, html, text };
}
