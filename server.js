
const http = require("http");
const WebSocket = require("ws");
const { WebcastPushConnection } = require("tiktok-live-connector");

const PORT = process.env.PORT || 8787;
const server = http.createServer((req, res) => {
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;

  res.setHeader("Cache-Control", "no-store");

  if (path === "/health" || path === "/health/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Ben Yasser TikTok Chat Bridge");
});

const wss = new WebSocket.Server({ server, path: "/ws" });
const connections = new Map();
const lives = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const username = (url.searchParams.get("username") || "").replace(/^@/, "");
  const room = url.searchParams.get("room") || "";

  if (!username || !room) {
    ws.close(1008, "username and room are required");
    return;
  }

  const key = `${username.toLowerCase()}:${room}`;
  if (!connections.has(key)) connections.set(key, new Set());
  connections.get(key).add(ws);

  if (!lives.has(key)) {
    const live = new WebcastPushConnection(username);
    lives.set(key, live);

    live.connect().catch(err => {
      console.error("TikTok connection failed:", err.message);
      lives.delete(key);
    });

    live.on("chat", data => {
      const message = JSON.stringify({
        type: "chat",
        username: data.uniqueId || "",
        comment: data.comment || "",
        room
      });

      for (const client of connections.get(key) || []) {
        if (client.readyState === WebSocket.OPEN) client.send(message);
      }
    });
  }

  ws.on("close", () => {
    const clients = connections.get(key);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) connections.delete(key);
    }
  });

  ws.send(JSON.stringify({ type: "connected", room, username }));
});

server.listen(PORT, () => console.log(`Bridge listening on ${PORT}`));
