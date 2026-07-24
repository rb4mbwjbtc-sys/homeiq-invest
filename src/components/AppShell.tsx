import { BarChart3, Building2, Home, Menu, PlusCircle, Settings, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/analyse", label: "Neue Analyse", icon: PlusCircle },
  { to: "/analysen", label: "Gespeicherte Analysen", icon: BarChart3 },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings }
];

export function AppShell() {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Building2 size={22} /></div>
          <div>
            <strong>HomeIQ</strong>
            <span>Invest</span>
          </div>
        </div>

        <nav className="nav">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="plan-card">
            <span className="eyebrow">HOMEIQ PREMIUM</span>
            <strong>Mehr aus jeder Analyse</strong>
            <small>Unbegrenzte Analysen, professionelle PDF-Berichte und geräteübergreifender Zugriff.</small>
          </div>
        </div>
      </aside>

      {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Menü schliessen" />}

      <div className="main-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Navigation öffnen">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="topbar-spacer" />
          <div className="status-pill"><span /> System bereit</div>
          <div className="avatar">PS</div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
