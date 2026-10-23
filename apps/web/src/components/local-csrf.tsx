"use client";
import { useEffect } from "react";
import { csrfToken } from "../lib/client/api";
import { localCsrfCookie } from "../lib/client/csrf";

// D-368: in `pnpm local` (no login) the first page a browser opens sets the CSRF cookie itself — any page, deep links too.
export function LocalCsrf() {
  useEffect(() => {
    if (!csrfToken()) document.cookie = localCsrfCookie(crypto.getRandomValues(new Uint8Array(32)));
  }, []);
  return null;
}
