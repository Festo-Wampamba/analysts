"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CandidateResearchPreview } from "@/components/CandidateResearchPreview";
import type { LatestIdea } from "@/lib/screen/get-latest-idea";

type Candidate = LatestIdea["candidates"][number];

const ROTATION_SECONDS = 5;

function initialIndex(candidates: Candidate[], ticker?: string | null): number {
  const matching = ticker
    ? candidates.findIndex((candidate) => candidate.ticker === ticker)
    : -1;
  return matching >= 0 ? matching : 0;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function CandidateCarousel({
  candidates: initialCandidates,
  initialTicker,
}: {
  candidates: Candidate[];
  initialTicker?: string | null;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedIndex, setSelectedIndex] = useState(() => initialIndex(initialCandidates, initialTicker));
  const [paused, setPaused] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(ROTATION_SECONDS);
  const [researchTicker, setResearchTicker] = useState<string | null>(initialTicker ?? initialCandidates[0]?.ticker ?? null);
  const trackRef = useRef<HTMLDivElement>(null);
  const selected = candidates[selectedIndex];
  const selectedTickerRef = useRef(selected?.ticker);
  const canRotate = candidates.length > 1;
  const rotationProgress = `${Math.round(((ROTATION_SECONDS - secondsRemaining) / ROTATION_SECONDS) * 100)}%`;

  useEffect(() => {
    selectedTickerRef.current = selected?.ticker;
  }, [selected?.ticker]);

  useEffect(() => {
    if (!canRotate || paused) return undefined;
    const timer = window.setInterval(() => {
      setSecondsRemaining((remaining) => {
        if (remaining > 1) return remaining - 1;
        setSelectedIndex((current) => (current + 1) % candidates.length);
        return ROTATION_SECONDS;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [canRotate, candidates.length, paused]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch("/api/daily-idea", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: unknown) => {
          if (!payload || typeof payload !== "object" || !("candidates" in payload)) return;
          const nextCandidates = (payload as { candidates?: unknown }).candidates;
          if (!Array.isArray(nextCandidates)) return;
          const normalized = nextCandidates.filter(
            (candidate): candidate is Candidate =>
              Boolean(candidate) &&
              typeof candidate === "object" &&
              typeof (candidate as Candidate).ticker === "string" &&
              typeof (candidate as Candidate).compositeScore === "number",
          );
          if (!normalized.length) return;

          setCandidates(normalized);
          setSelectedIndex((current) => {
            const matching = normalized.findIndex((candidate) => candidate.ticker === selectedTickerRef.current);
            return matching >= 0 ? matching : Math.min(current, normalized.length - 1);
          });
        })
        .catch(() => {
          // The already-rendered queue remains useful if a background refresh
          // is unavailable; no error should interrupt research reading.
        });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    trackRef.current
      ?.querySelector<HTMLElement>(`[data-candidate-index="${selectedIndex}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedIndex]);

  if (!selected) return null;

  function choose(index: number, loadResearch = true) {
    const nextIndex = (index + candidates.length) % candidates.length;
    setSelectedIndex(nextIndex);
    if (loadResearch) setResearchTicker(candidates[nextIndex]?.ticker ?? null);
    setSecondsRemaining(ROTATION_SECONDS);
  }

  return (
    <section className="candidate-carousel" aria-label="Screened candidate queue">
      <div className="candidate-carousel__head">
        <div className="candidate-carousel__queue-meta">
          <span>Ranked research queue ({candidates.length})</span>
          <i aria-hidden="true"><b style={{ width: rotationProgress }} /></i>
          <p aria-live="polite">
            {canRotate
              ? paused
                ? "Rotation paused"
                : `Auto advance in ${formatSeconds(secondsRemaining)}`
              : "One ranked candidate"}
          </p>
        </div>
        <div className="candidate-carousel__controls">
          <button
            type="button"
            onClick={() => choose(selectedIndex - 1)}
            disabled={!canRotate}
            aria-label="Show previous candidate"
          >
            <span aria-hidden="true">‹</span>
            <span className="sr-only">Previous</span>
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            disabled={!canRotate}
            aria-pressed={paused}
          >
            {paused ? "Resume rotation" : "Pause rotation"}
          </button>
          <button
            type="button"
            onClick={() => choose(selectedIndex + 1)}
            disabled={!canRotate}
            aria-label="Show next candidate"
          >
            <span aria-hidden="true">›</span>
            <span className="sr-only">Next</span>
          </button>
        </div>
      </div>
      <div className="candidate-carousel__track" ref={trackRef}>
        {candidates.map((candidate, index) => (
          <button
            type="button"
            className={index === selectedIndex ? "is-selected" : ""}
            aria-pressed={index === selectedIndex}
            aria-label={`Show ${candidate.ticker}, ranked ${candidate.rank}`}
            data-candidate-index={index}
            key={candidate.ticker}
            onClick={() => choose(index)}
          >
            <div>
              <strong>{candidate.ticker}</strong>
              <b>{candidate.compositeScore.toFixed(2)}</b>
            </div>
            <em>{candidate.sector ?? "Sector unavailable"}</em>
            <span>Rank {candidate.rank}</span>
          </button>
        ))}
      </div>
      <div className="candidate-carousel__selection" aria-live="polite">
        <div>
          <span>Selected result</span>
          <strong>{selected.ticker}</strong>
          <p>{selected.catalyst ?? "Factor detail will be available in the sourced report."}</p>
        </div>
        <Link className="button" href={`/research/${selected.ticker}`}>
          Open full sourced report
        </Link>
      </div>
      {candidates.length < 20 && (
        <p className="candidate-carousel__legacy-note" role="status">
          This completed screen retained {candidates.length} ranked candidates. New screens retain the top 20.
        </p>
      )}
      {researchTicker && researchTicker !== selected.ticker && (
        <p className="candidate-carousel__auto-note" role="status">
          Auto rotation highlighted {selected.ticker}. Select it to load its sourced research; the preview below remains {researchTicker}.
        </p>
      )}
      {researchTicker && <CandidateResearchPreview ticker={researchTicker} />}
    </section>
  );
}
