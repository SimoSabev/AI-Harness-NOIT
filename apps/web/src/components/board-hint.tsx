"use client";
import { useEffect, useState } from "react";

// т. 8.1: shown on the first visit of the board only.
export function BoardHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("mandat-board-hint")) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <p className="hint">
      Колоните ги мести присъдата, ти действаш с бутоните.{" "}
      <button className="btn" type="button" onClick={() => { try { localStorage.setItem("mandat-board-hint", "1"); } catch { /* blocked */ } setShow(false); }}>Разбрах</button>
    </p>
  );
}
