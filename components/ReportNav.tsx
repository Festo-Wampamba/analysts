"use client";

import { useEffect, useState } from "react";

export const reportSections = [
  ["overview", "Overview"],
  ["business-model", "Business model"],
  ["financials", "Financials"],
  ["valuation", "Valuation"],
  ["peers", "Peers"],
  ["growth-drivers", "Growth drivers"],
  ["catalysts", "Catalysts"],
  ["risks", "Risks"],
  ["cases", "Bull / Base / Bear"],
  ["thesis", "Thesis"],
  ["sources", "Sources"],
] as const;

export function ReportNav() {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const sections = reportSections
      .map(([id]) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length || !("IntersectionObserver" in window)) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (current) setActiveSection(current.target.id);
      },
      { rootMargin: "-18% 0px -70%", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <aside className="report-nav" aria-label="Report sections">
      <div className="report-nav__label">Report sections</div>
      {reportSections.map(([id, title]) => (
        <a
          className={activeSection === id ? "is-active" : ""}
          href={`#${id}`}
          key={id}
          onClick={() => setActiveSection(id)}
        >
          {title}
        </a>
      ))}
    </aside>
  );
}
