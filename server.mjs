import http from "node:http";
import { readFile } from "node:fs/promises";
const files = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/engine.js": ["engine.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
};
const server = http.createServer(async (req, res) => {
  const file = files[new URL(req.url, "http://localhost").pathname];
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const body = await readFile(new URL(`public/${file[0]}`, import.meta.url));
    res.writeHead(200, {
      "Content-Type": file[1],
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("Unable to load application");
  }
});
server.listen(Number(process.env.PORT || 4310), "127.0.0.1", () =>
  console.log(`CarryForward: http://127.0.0.1:${server.address().port}`),
);
