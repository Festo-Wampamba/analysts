import { z } from "zod";

import type { GeneratedContentMeta } from "@/lib/domain/provenance";
import { fetchWithRetry } from "@/lib/http/retry";
import { recordSourceCall } from "@/lib/source/log";

const BASE_URL = "https://api.groq.com/openai/v1";
const ENDPOINT = "/chat/completions";
const TIMEOUT_MS = 60_000;
const PROVIDER = "groq";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export class GroqError extends Error {
  readonly httpStatus?: number;

  constructor(message: string, opts: { httpStatus?: number; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "GroqError";
    this.httpStatus = opts.httpStatus;
  }
}

export type GroqCallContext = {
  ticker?: string;
  reportId?: number;
  researchRunId?: number;
  runId?: number;
};

export type GroqUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type Generated<T> = {
  data: T;
  model: string;
  usage: GroqUsage;
  meta: GeneratedContentMeta;
};

const completionSchema = z.object({
  model: z.string(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

// One JSON-mode chat completion, validated against `outputSchema`. Every call
// is logged to source_calls with the token usage in meta so per-report cost
// (README §11) can be measured straight from the database.
export async function groqJson<S extends z.ZodType>(
  params: {
    system: string;
    user: string;
    outputSchema: S;
    /** source block identifiers the prompt was built from, for provenance */
    basedOn: string[];
    temperature?: number;
  },
  ctx: GroqCallContext = {},
): Promise<Generated<z.output<S>>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqError("GROQ_API_KEY is not set");
  const model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;

  const fetchedAt = new Date();
  const started = performance.now();
  const log = (
    row: Partial<{ httpStatus: number; meta: Record<string, unknown> }> & {
      status: "fresh" | "failed";
    },
  ) =>
    recordSourceCall({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      ticker: ctx.ticker,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      reportId: ctx.reportId,
      researchRunId: ctx.researchRunId,
      runId: ctx.runId,
      ...row,
    });

  let res: Response;
  try {
    res = await fetchWithRetry(`${BASE_URL}${ENDPOINT}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    await log({ status: "failed", meta: { error: (cause as Error).message } });
    throw new GroqError("network failure on chat completion", { cause });
  }

  if (!res.ok) {
    await log({ status: "failed", httpStatus: res.status });
    throw new GroqError(`chat completion returned HTTP ${res.status}`, {
      httpStatus: res.status,
    });
  }

  const completion = completionSchema.safeParse(
    await res.json().catch(() => undefined),
  );
  if (!completion.success) {
    await log({
      status: "failed",
      httpStatus: res.status,
      meta: { error: "completion failed schema validation" },
    });
    throw new GroqError("completion response failed schema validation", {
      httpStatus: res.status,
    });
  }

  const { usage } = completion.data;
  const usageMeta = {
    model: completion.data.model,
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
  };

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(completion.data.choices[0].message.content);
  } catch {
    await log({
      status: "failed",
      httpStatus: res.status,
      meta: { ...usageMeta, error: "model returned invalid JSON" },
    });
    throw new GroqError("model returned invalid JSON", { httpStatus: res.status });
  }

  const output = params.outputSchema.safeParse(parsedContent);
  if (!output.success) {
    await log({
      status: "failed",
      httpStatus: res.status,
      meta: { ...usageMeta, error: "model output failed narrative schema" },
    });
    throw new GroqError("model output failed narrative schema", {
      httpStatus: res.status,
    });
  }

  await log({ status: "fresh", httpStatus: res.status, meta: usageMeta });

  return {
    data: output.data,
    model: completion.data.model,
    usage: usageMeta.usage,
    meta: {
      generatedAt: fetchedAt.toISOString(),
      basedOn: params.basedOn,
      modelLabel: completion.data.model,
      status: "generated",
    },
  };
}
