export function Settings() {
  return (
    <div className="page-stack narrow">
      <div className="page-heading">
        <span className="eyebrow">KONTO & SYSTEM</span>
        <h1>Einstellungen</h1>
        <p>Die Kontoverwaltung wird mit dem eigenen Supabase-Backend in einer späteren Phase aktiviert.</p>
      </div>
      <section className="panel settings-list">
        <div><span>Sprache</span><strong>Deutsch (Schweiz)</strong></div>
        <div><span>Währung</span><strong>CHF</strong></div>
        <div><span>Datenregion</span><strong>Schweiz</strong></div>
        <div><span>Version</span><strong>Independent v1 · Schritt 1</strong></div>
      </section>
    </div>
  );
}
