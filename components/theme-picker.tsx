"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Palette } from "lucide-react";

export const APP_THEMES = [{ id: "light", label: "Claro" }, { id: "graphite", label: "Grafito" }, { id: "night", label: "Noche azul" }, { id: "paper", label: "Papel" }] as const;
type AppTheme = typeof APP_THEMES[number]["id"];
const KEY = "uml-studio-interface-theme";
let memoryTheme: AppTheme = "light";
function snapshot(): AppTheme {
  try { const value = localStorage.getItem(KEY); if (APP_THEMES.some(t => t.id === value)) return value as AppTheme; } catch { /* Browser storage is optional. */ }
  return memoryTheme;
}
function serverSnapshot(): AppTheme { return "light"; }
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener); window.addEventListener("uml-theme-change", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("uml-theme-change", listener); };
}
export function useAppTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { theme, isDark: theme === "graphite" || theme === "night" };
}
export function ThemeManager() {
  const { theme } = useAppTheme();
  useEffect(() => { document.documentElement.dataset.appTheme = theme; }, [theme]);
  return null;
}
export default function ThemePicker() {
  const { theme } = useAppTheme();
  return <label className="theme-picker"><Palette size={16} aria-hidden="true" /><select aria-label="Tema de interfaz" value={theme} onChange={event => {
    memoryTheme = event.target.value as AppTheme;
    try { localStorage.setItem(KEY, memoryTheme); } catch { /* The current session still uses the selected theme. */ }
    window.dispatchEvent(new Event("uml-theme-change"));
  }}>{APP_THEMES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
}
