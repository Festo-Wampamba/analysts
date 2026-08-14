export default function Loading() {
  return (
    <main className="loading-shell" aria-label="Loading research workspace">
      <div className="loading-bar" />
      <div className="loading-card loading-card--hero" />
      <div className="loading-card" />
      <div className="loading-grid"><div className="loading-card" /><div className="loading-card" /></div>
    </main>
  );
}
