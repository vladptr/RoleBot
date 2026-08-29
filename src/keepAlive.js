import http from "node:http";

const port = Number(process.env.PORT) || 8080;

export function keepAlive(isReady = () => true) {
  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0];
    const alive = path === "/" || path === "/health";

    if (!alive) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (path === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ready: isReady() }));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bot is alive!");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Keep-alive слушает 0.0.0.0:${port}`);
  });

  return server;
}
