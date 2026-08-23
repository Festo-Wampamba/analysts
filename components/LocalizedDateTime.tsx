"use client";

import { useEffect, useState } from "react";

type DateTimeValue = Date | string | null | undefined;

const UTC = "UTC";

export const dateTimeOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
} as const satisfies Intl.DateTimeFormatOptions;

function viewerTimeZone(): string {
  if (typeof window === "undefined") return UTC;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UTC;
  } catch {
    return UTC;
  }
}

export function formatDateTime(
  value: DateTimeValue,
  timeZone = UTC,
  options: Intl.DateTimeFormatOptions = dateTimeOptions,
  unavailableLabel = "Unavailable",
): string {
  if (!value) return unavailableLabel;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return unavailableLabel;

  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: UTC }).format(date);
  }
}

export function useViewerTimeZone(): string {
  // UTC is deliberately the initial value so server and first client render
  // agree. The visitor's IANA time zone replaces it once the browser mounts.
  const [timeZone, setTimeZone] = useState(UTC);

  useEffect(() => {
    const updateTimer = window.setTimeout(() => setTimeZone(viewerTimeZone()), 0);
    return () => window.clearTimeout(updateTimer);
  }, []);

  return timeZone;
}

export function LocalizedDateTime({
  value,
  options = dateTimeOptions,
  unavailableLabel,
}: {
  value: DateTimeValue;
  options?: Intl.DateTimeFormatOptions;
  unavailableLabel?: string;
}) {
  const timeZone = useViewerTimeZone();
  const parsed = value ? new Date(value) : null;
  const dateTime = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
  const label = formatDateTime(value, timeZone, options, unavailableLabel);

  return <time dateTime={dateTime} title={timeZone}>{label}</time>;
}
