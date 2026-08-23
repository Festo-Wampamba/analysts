// Guards between the model and the user (Final-design.md §16 hallucination
// prevention; interview question "how is numerical information validated").
//
// Numeric guard: generated prose may only contain numbers traceable to the
// sourced-facts allowlist. Extraction is deliberately aggressive (currency,
// separators, magnitude suffixes, percents) so reformatting can't smuggle an
// invented figure past the check.

export type NumericClaim = {
  raw: string;
  value: number;
};

export type NumericGuardResult = {
  ok: boolean;
  violations: NumericClaim[];
  claims: NumericClaim[];
};

export type NarrativeClaimGuardResult = {
  ok: boolean;
  violations: string[];
};

/** Context for claims that are meaningful but are not themselves numbers. */
export type NarrativeClaimContext = {
  ticker: string;
  peerTickers?: string[];
  analystRecommendations?: { hold: number; buy: number; strongBuy: number; sell: number; strongSell: number };
};

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
};

const NUMBER_PATTERN = new RegExp(
  String.raw`(?<![\w.])[$€£]?\s?` + // optional currency prefix
    String.raw`(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)` + // digits
    String.raw`\s?(k|m|mm|million|b|bn|billion|t|tn|trillion)?\b` + // magnitude
    String.raw`(\s?%)?`, // percent
  "gi",
);

type IndexedClaim = NumericClaim & { index: number; matchLength: number };

function extractIndexedClaims(text: string): IndexedClaim[] {
  const claims: IndexedClaim[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const [raw, digits, suffix] = match;
    const bare = digits.replace(/,/g, "");
    const value = Number(bare) * (suffix ? SUFFIX_MULTIPLIERS[suffix.toLowerCase()] : 1);
    if (!Number.isFinite(value)) continue;
    claims.push({ raw: raw.trim(), value, index: match.index ?? 0, matchLength: raw.length });
  }
  return claims;
}

export function extractNumericClaims(text: string): NumericClaim[] {
  return extractIndexedClaims(text).map(({ raw, value }) => ({ raw, value }));
}

// Tolerance from displayed precision: "228" may stand for anything in
// [227.5, 228.5); "1.2B" for anything within ±0.05B. Half a unit of the last
// displayed digit, scaled by any magnitude suffix.
function toleranceOf(claim: NumericClaim): number {
  const digitsMatch = claim.raw.match(/-?\d[\d,]*(?:\.(\d+))?/);
  const decimals = digitsMatch?.[1]?.length ?? 0;
  const suffix = claim.raw.match(/(k|m|mm|million|b|bn|billion|t|tn|trillion)\b/i)?.[1];
  const scale = suffix ? SUFFIX_MULTIPLIERS[suffix.toLowerCase()] : 1;
  return 0.5 * 10 ** -decimals * scale;
}

function isExemptInteger(claim: NumericClaim, allowYears: boolean): boolean {
  const isBareInteger = /^-?\d+$/.test(claim.raw);
  if (!isBareInteger) return false;
  // Small counts read as prose ("3 scenarios", "top 5"), not data claims.
  if (Math.abs(claim.value) <= 12) return true;
  // Years appear constantly in narrative ("since 2019"); low-risk by default.
  if (allowYears && claim.value >= 1900 && claim.value <= 2100) return true;
  return false;
}

// "52-week high", "trading over 52 weeks": the number names a lookback
// window, not a data point, so it never needs to trace to the allowlist.
// The leading separator is optional because NUMBER_PATTERN's trailing `\s?`
// (reserved for a magnitude suffix) already consumes a space-joined case
// ("52 weeks" -> match "52 ", leaving "weeks" with no separator left).
const PERIOD_TERM = /^[\s-]?(week|day|month|year)s?\b/i;

function isPeriodVocabulary(text: string, claim: IndexedClaim): boolean {
  return PERIOD_TERM.test(text.slice(claim.index + claim.matchLength));
}

export function verifyNumericClaims(
  text: string,
  allowedNumbers: number[],
  opts: { allowYears?: boolean } = {},
): NumericGuardResult {
  const allowYears = opts.allowYears ?? true;
  const indexedClaims = extractIndexedClaims(text);
  const claims = indexedClaims.map(({ raw, value }) => ({ raw, value }));

  const violations = indexedClaims
    .filter((claim) => {
      if (isExemptInteger(claim, allowYears)) return false;
      if (isPeriodVocabulary(text, claim)) return false;
      const tolerance = toleranceOf(claim);
      return !allowedNumbers.some((allowed) => {
        if (Math.abs(claim.value - allowed) <= tolerance) return true;
        // Prose states the magnitude of a signed move ("fell 2.13") while the
        // sourced fact carries the sign ("-2.13"); compare by absolute value
        // only when the allowed fact is negative, so this can't also make an
        // unrelated positive fact excuse a fabricated negative claim.
        return allowed < 0 && Math.abs(claim.value - Math.abs(allowed)) <= tolerance;
      });
    })
    .map(({ raw, value }) => ({ raw, value }));

  return { ok: violations.length === 0, violations, claims };
}

// Numeric allowlists cannot detect a false statement such as "no holds" or
// an invented historical-premium comparison. Keep this deliberately narrow:
// it rejects only assertions for which the sourced snapshot can prove the
// statement false, plus comparative language unsupported by a history series.
export function verifyNarrativeClaims(
  text: string,
  context: NarrativeClaimContext,
): NarrativeClaimGuardResult {
  const violations: string[] = [];
  const normalized = text.toLowerCase();
  const recommendations = context.analystRecommendations;
  if (recommendations) {
    if (recommendations.hold > 0 && /\b(no|zero)\s+(analyst\s+)?holds?\b/i.test(text)) {
      violations.push("claim says there are no analyst holds despite sourced hold coverage");
    }
    if (recommendations.buy + recommendations.strongBuy > 0 && /\b(no|zero)\s+(strong\s+)?buys?\b/i.test(text)) {
      violations.push("claim says there are no buy recommendations despite sourced buy coverage");
    }
    if (recommendations.sell + recommendations.strongSell > 0 && /\b(no|zero)\s+(strong\s+)?sells?\b/i.test(text)) {
      violations.push("claim says there are no sell recommendations despite sourced sell coverage");
    }
  }
  if (/\b(historical|historic)\s+(average|mean|multiple|premium|discount)\b/.test(normalized)) {
    violations.push("historical comparison has no sourced history series in the report facts");
  }

  const permittedTickerTokens = new Set([
    context.ticker.toUpperCase(),
    ...(context.peerTickers ?? []).map((ticker) => ticker.toUpperCase()),
    "AI", "EPS", "FCF", "SEC", "TTM", "USD", "P", "E",
  ]);
  const tickerLikeTokens = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const token of tickerLikeTokens) {
    if (!permittedTickerTokens.has(token)) {
      violations.push(`ticker-like token ${token} is absent from sourced identity and peer facts`);
      break;
    }
  }
  return { ok: violations.length === 0, violations };
}

// Adversarial input sanitization: external text (news headlines, summaries)
// flows into LLM prompts. This cannot make injected English harmless — the
// prompt must still frame it as data — but it removes the cheap tricks:
// control characters, zero-width/bidi characters, runaway length.
const CONTROL_AND_INVISIBLE =
  /[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g;

export function sanitizeSourceText(text: string, maxLength = 500): string {
  // Collapse whitespace before stripping controls so \n and \t become
  // spaces instead of vanishing and joining words.
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(CONTROL_AND_INVISIBLE, "")
    .trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1)}…`;
}

export function sanitizeSourceUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
