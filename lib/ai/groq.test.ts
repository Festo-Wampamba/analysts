import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const insertedRows: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return Promise.resolve();
      },
    }),
  },
  schema: { sourceCalls: {} },
}));

import { GroqError, groqJson } from "./groq";

const outputSchema = z.object({ thesis: z.string() });

const params = {
  system: "You are an equity analyst.",
  user: "Write the thesis.",
  outputSchema,
  basedOn: ["quote:AAPL"],
};

function completionBody(content: string) {
  return {
    model: "llama-3.3-70b-versatile",
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 900, completion_tokens: 150, total_tokens: 1050 },
  };
}

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

beforeEach(() => {
  insertedRows.length = 0;
  vi.stubEnv("GROQ_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("groqJson", () => {
  it("returns schema-validated data from the model's JSON content", async () => {
    mockFetchOnce(200, completionBody('{"thesis":"Quality compounder."}'));
    const { data } = await groqJson(params);
    expect(data).toEqual({ thesis: "Quality compounder." });
  });

  it("returns provenance meta naming the source blocks", async () => {
    mockFetchOnce(200, completionBody('{"thesis":"x"}'));
    const { meta } = await groqJson(params);
    expect(meta).toMatchObject({
      basedOn: ["quote:AAPL"],
      modelLabel: "llama-3.3-70b-versatile",
    });
  });

  it("logs token usage to source_calls meta for cost measurement", async () => {
    mockFetchOnce(200, completionBody('{"thesis":"x"}'));
    await groqJson(params, { ticker: "AAPL" });
    expect(insertedRows[0]).toMatchObject({
      provider: "groq",
      endpoint: "/chat/completions",
      ticker: "AAPL",
      status: "fresh",
      meta: {
        usage: { promptTokens: 900, completionTokens: 150, totalTokens: 1050 },
      },
    });
  });

  it("throws a GroqError carrying the status on HTTP 429", async () => {
    mockFetchOnce(429, { error: { message: "rate limited" } });
    await expect(groqJson(params)).rejects.toMatchObject({
      name: "GroqError",
      httpStatus: 429,
    });
  });

  it("logs a failed row on HTTP error", async () => {
    mockFetchOnce(500, {});
    await groqJson(params).catch(() => {});
    expect(insertedRows[0]).toMatchObject({ status: "failed", httpStatus: 500 });
  });

  it("throws when the model returns invalid JSON", async () => {
    mockFetchOnce(200, completionBody("not json at all"));
    await expect(groqJson(params)).rejects.toMatchObject({
      message: "model returned invalid JSON",
    });
  });

  it("still logs usage when the model returns invalid JSON", async () => {
    mockFetchOnce(200, completionBody("not json at all"));
    await groqJson(params).catch(() => {});
    expect(insertedRows[0]).toMatchObject({
      status: "failed",
      meta: { usage: { totalTokens: 1050 } },
    });
  });

  it("throws when the JSON does not match the output schema", async () => {
    mockFetchOnce(200, completionBody('{"wrong":"shape"}'));
    await expect(groqJson(params)).rejects.toMatchObject({
      message: "model output failed narrative schema",
    });
  });

  it("throws a GroqError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(groqJson(params)).rejects.toBeInstanceOf(GroqError);
  });

  it("throws before fetching when GROQ_API_KEY is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    await expect(groqJson(params)).rejects.toMatchObject({
      message: "GROQ_API_KEY is not set",
    });
  });

  it("sends the request in JSON mode with both messages", async () => {
    mockFetchOnce(200, completionBody('{"thesis":"x"}'));
    await groqJson(params);
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toMatchObject({
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    });
  });

  it("retries once on a 500 before succeeding", async () => {
    const completion = {
      model: "llama-3.3-70b-versatile",
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outputSchema = z.object({ ok: z.boolean() });
    const result = await groqJson({
      system: "s",
      user: "u",
      outputSchema,
      basedOn: ["test"],
    });

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
