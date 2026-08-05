import { db, schema } from "@/lib/db";

export type SourceCallRow = {
  provider: string;
  endpoint: string;
  ticker?: string;
  httpStatus?: number;
  providerTimestamp?: Date;
  fetchedAt: Date;
  latencyMs: number;
  status: "fresh" | "failed";
  reportId?: number;
  runId?: number;
  meta?: Record<string, unknown>;
};

export async function recordSourceCall(row: SourceCallRow): Promise<void> {
  try {
    await db.insert(schema.sourceCalls).values(row);
  } catch (err) {
    // Audit logging must not turn a successful provider call into a failure.
    console.error("source_calls insert failed:", (err as Error).message);
  }
}
