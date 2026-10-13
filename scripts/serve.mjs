// Local development preview. Serve only built public HTML, never private files.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const routes = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/resume-formatter.html", "resume-formatter.html"],
  ["/dist/resume-formatter.html", "dist/resume-formatter.html"],
]);

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  const path = new URL(request.url, "http://127.0.0.1:8000").pathname;
  const file = routes.get(path);
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const html = await readFile(fileURLToPath(new URL(file, root)));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : html);
  } catch {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Build the project first: npm run build");
  }
});

server.on("error", (error) => {
  console.error(`Preview failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(8000, "127.0.0.1", () => {
  console.log("Resume Copilot preview: http://127.0.0.1:8000 (Ctrl+C to stop)");
});
