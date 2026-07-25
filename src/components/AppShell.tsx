import { BarChart3, Home, Menu, PlusCircle, Settings, X } from "lucide-react";
import homeIqLogo from "../assets/homeiq-logo.jpg";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/analyse", label: "Neue Analyse", icon: PlusCircle },
  { to: "/analysen", label: "Gespeicherte Analysen", icon: BarChart3 },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell topnav-layout">
      <header className="topbar global-header">
        <NavLink to="/" className="header-brand" onClick={() => setOpen(false)}>
          <img src={homeIqLogo} alt="HomeIQ Invest" />
          <div><strong>HomeIQ</strong><span>Invest</span></div>
        </NavLink>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Navigation öffnen">
          {open ? <X size={22}/> : <Menu size={22}/>} 
        </button>
        <nav className={`header-nav ${open ? "header-nav-open" : ""}`}>
          {navigation.map(({to,label,icon:Icon,end}) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({isActive}) => isActive ? "header-nav-link active" : "header-nav-link"}>
              <Icon size={18}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="header-account">
          <div className="status-pill"><span/> System bereit</div>
          <div className="avatar" title="Angemeldet als PS">PS</div>
        </div>
      </header>
      {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Menü schliessen"/>}
      <div className="main-column"><main className="content"><Outlet/></main></div>
    </div>
  );
}
