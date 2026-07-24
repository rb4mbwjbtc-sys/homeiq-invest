import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { NewAnalysis } from "./pages/NewAnalysis";
import { Analyses } from "./pages/Analyses";
import { Settings } from "./pages/Settings";
import { NotFound } from "./pages/NotFound";
import { Result } from "./pages/Result";
export default function App(){return <Routes><Route element={<AppShell/>}><Route index element={<Dashboard/>}/><Route path="analyse" element={<NewAnalysis/>}/><Route path="analyse/:id" element={<NewAnalysis/>}/><Route path="analysen" element={<Analyses/>}/><Route path="ergebnis/:id" element={<Result/>}/><Route path="einstellungen" element={<Settings/>}/></Route><Route path="/dashboard" element={<Navigate to="/" replace/>}/><Route path="*" element={<NotFound/>}/></Routes>}
