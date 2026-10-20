import Link from "next/link";
import { ThemeSelect } from "./theme";

// Header with the counter (also in <title>, via generateMetadata of each page).
export function Shell({ current, waiting, children, wide = false }: { current: "inbox" | "board" | "task" | "login" | "harness"; waiting: number | null; children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <a className="skip" href="#main">Към съдържанието</a>
      <header className="top">
        <Link className="brand" href="/">Мандат</Link>
        {waiting !== null && (
          <nav aria-label="Основна">
            <Link href="/" aria-current={current === "inbox" ? "page" : undefined}>
              Чака теб<span className="count" aria-label={`${waiting} чакат`}>{waiting}</span>
            </Link>
            <Link href="/board" aria-current={current === "board" ? "page" : undefined}>Дъска</Link>
            <Link href="/harness" aria-current={current === "harness" ? "page" : undefined}>Харнес</Link>
            <form action="/api/auth/logout" method="post">
              <button className="btn" type="submit">Изход</button>
            </form>
          </nav>
        )}
        <ThemeSelect />
      </header>
      <main id="main" className={wide ? "wide" : undefined} tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
