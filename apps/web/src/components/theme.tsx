"use client";
import { useEffect, useState } from "react";

// Тема: система / светла / тъмна (Ф4); the choice stays in this browser only.
export function ThemeSelect() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    try {
      setTheme(localStorage.getItem("mandat-theme") ?? "system");
    } catch {
      // storage blocked
    }
  }, []);
  const change = (v: string) => {
    setTheme(v);
    if (v === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    try {
      localStorage.setItem("mandat-theme", v);
    } catch {
      // storage blocked
    }
  };
  return (
    <label>
      <span className="sr-only">Тема</span>
      <select className="btn" value={theme} onChange={(e) => change(e.target.value)} aria-label="Тема">
        <option value="system">Тема: система</option>
        <option value="light">Светла</option>
        <option value="dark">Тъмна</option>
      </select>
    </label>
  );
}
