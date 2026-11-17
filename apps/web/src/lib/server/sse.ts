// A feed as Server-Sent Events (research D-409, conversations D-531): each tick loads what is new after the cursor and
// sends it as `event: feed` with `id: <cursor>` (EventSource resumes with Last-Event-ID); a comment pings every 15 s;
// the stream closes when the feed says it is done, the feed is gone, the client leaves or maxMs passes.
export interface SseFeed<F> {
  first: F;
  load: (after: number) => Promise<F | null>;
  /** the cursor after this feed (the last item's seq), or null when it brought no item */
  cursorOf: (f: F) => number | null;
  /** what changes besides new items (a state, a cost): a new value is sent even without items */
  sig: (f: F) => string;
  hasNews: (f: F) => boolean;
  done: (f: F) => boolean;
  after: number;
  intervalMs?: number;
  maxMs?: number;
}

export function sseResponse<F>(req: Request, o: SseFeed<F>): Response {
  const enc = new TextEncoder();
  const intervalMs = o.intervalMs ?? 600;
  const maxMs = o.maxMs ?? 5 * 60_000;
  let after = o.after;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sig = "";
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      const started = Date.now();
      let pinged = started;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          ctl.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener("abort", close);
      const send = (f: F): boolean => {
        const now = o.sig(f);
        if (o.hasNews(f) || now !== sig) {
          sig = now;
          after = o.cursorOf(f) ?? after;
          ctl.enqueue(enc.encode(`event: feed\nid: ${after}\ndata: ${JSON.stringify(f)}\n\n`));
        }
        return o.done(f);
      };
      const tick = async () => {
        if (closed) return;
        if (Date.now() - started >= maxMs) return close();
        try {
          const f = await o.load(after);
          if (!f) return close();
          if (send(f)) return close();
          if (Date.now() - pinged >= 15_000) {
            pinged = Date.now();
            ctl.enqueue(enc.encode(": ping\n\n"));
          }
        } catch {
          return close();
        }
        timer = setTimeout(() => void tick(), intervalMs);
      };
      if (send(o.first)) return close();
      timer = setTimeout(() => void tick(), intervalMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}

/** the cursor of a stream request: Last-Event-ID, else ?after=, else -1; null when it is not a number */
export function sseCursor(req: Request): number | null {
  const cursor = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after");
  if (cursor === null) return -1;
  return /^-?\d{1,6}$/.test(cursor) ? Number(cursor) : null;
}
