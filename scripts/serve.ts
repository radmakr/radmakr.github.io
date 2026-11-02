// Local dev server: serves the repo exactly as GitHub Pages will, and reloads
// the browser whenever a file changes. Zero dependencies, like the site.
//
//   bun run dev            → http://localhost:3000
//   PORT=4000 bun run dev  → pick another port

import { watch } from "node:fs";
import { join } from "node:path";
import { resolveRequestPath } from "./routes.ts";

const root = join(import.meta.dir, "..");
const port = Number(Bun.env.PORT ?? 3000);
const encoder = new TextEncoder();
const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>();

const reloadScript = `<script type="module">
  new EventSource("/__reload").addEventListener("reload", () => location.reload());
</script>`;

function start() {
  try {
    return Bun.serve({
      port,
      async fetch(request, server) {
        const { pathname } = new URL(request.url);
        if (pathname === "/__reload") {
          server.timeout(request, 0);
          return reloadEvents(request);
        }

        const file = await resolveRequestPath(pathname, (path) => Bun.file(join(root, path)).exists());
        return file ? serve(file, 200) : serve("404.html", 404);
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "EADDRINUSE") throw error;
    console.error(`Port ${port} is taken. Try PORT=${port + 1} bun run dev`);
    process.exit(1);
  }
}

const server = start();

async function serve(relativePath: string, status: number): Promise<Response> {
  const file = Bun.file(join(root, relativePath));
  const headers = { "cache-control": "no-store" };

  if (!relativePath.endsWith(".html")) return new Response(file, { status, headers });

  const html = (await file.text()).replace("</body>", `${reloadScript}\n</body>`);
  return new Response(html, { status, headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
}

function reloadEvents(request: Request): Response {
  let listener: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      listener = controller;
      listeners.add(controller);
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      if (listener) listeners.delete(listener);
    },
  });
  request.signal.addEventListener("abort", () => {
    if (listener) listeners.delete(listener);
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
}

let pendingReload: ReturnType<typeof setTimeout> | undefined;
const ignored = /^(\.git|\.build|node_modules|tests)(\/|$)|\.DS_Store$/;

watch(root, { recursive: true }, (_event, filename) => {
  if (!filename || ignored.test(filename)) return;
  clearTimeout(pendingReload);
  pendingReload = setTimeout(() => {
    for (const listener of listeners) {
      try {
        listener.enqueue(encoder.encode("event: reload\ndata: \n\n"));
      } catch {
        listeners.delete(listener);
      }
    }
  }, 80);
});

console.log(`radmakr.com → ${server.url}`);
console.log("Watching for changes. Ctrl-C to stop.");
