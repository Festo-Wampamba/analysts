import { recordSourceCall } from "@/lib/source/log";

// Resend's REST API is a single POST; a client library would add a dependency
// for less code than this.
const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;

export type EmailMessage = {
  subject: string;
  html: string;
  text: string;
};

export type EmailResult =
  | { delivered: true; id: string }
  | { delivered: false; error: string };

// Delivery failure must never fail the screen run — the idea is already
// persisted and readable in the app, so the error is recorded and returned.
export async function sendEmail(
  message: EmailMessage,
  ctx: { runId?: number } = {},
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DAILY_IDEA_FROM;
  const to = process.env.DAILY_IDEA_TO;

  if (!apiKey || !from || !to) {
    return {
      delivered: false,
      error: "email not configured (RESEND_API_KEY, DAILY_IDEA_FROM, DAILY_IDEA_TO)",
    };
  }

  const fetchedAt = new Date();
  const started = performance.now();

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: to.split(",").map((address) => address.trim()),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const latencyMs = Math.round(performance.now() - started);
    const body = (await res.json().catch(() => ({}))) as { id?: string };

    await recordSourceCall({
      provider: "resend",
      endpoint: "/emails",
      httpStatus: res.status,
      fetchedAt,
      latencyMs,
      status: res.ok ? "fresh" : "failed",
      runId: ctx.runId,
    });

    return res.ok && body.id
      ? { delivered: true, id: body.id }
      : { delivered: false, error: `resend returned HTTP ${res.status}` };
  } catch (err) {
    await recordSourceCall({
      provider: "resend",
      endpoint: "/emails",
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      runId: ctx.runId,
      meta: { error: (err as Error).message },
    });
    return { delivered: false, error: (err as Error).message };
  }
}
