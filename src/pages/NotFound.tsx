import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">404</span>
      <h1>Seite nicht gefunden</h1>
      <Link className="button primary" to="/">Zum Dashboard</Link>
    </main>
  );
}
