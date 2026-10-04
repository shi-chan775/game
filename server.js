import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";

const isDevelopment = process.argv.includes("--dev");
const port = Number(process.env.PORT || 5173);
const rooms = new Map();
const connections = new Map();
const roomCodeCharacters = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

let vite;
let server;

if (isDevelopment) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    appType: "spa",
    server: { middlewareMode: true },
  });
  server = createServer(vite.middlewares);
} else {
  const distributionPath = resolve("dist");
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const requestedPath = pathname === "/" ? "/index.html" : pathname;
      const filePath = resolve(distributionPath, `.${requestedPath}`);
      if (!filePath.startsWith(`${distributionPath}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      let file;
      try {
        file = await stat(filePath);
      } catch {
        file = null;
      }
      const targetPath = file?.isFile() ? filePath : resolve(distributionPath, "index.html");
      const contents = await readFile(targetPath);
      response.writeHead(200, {
        "Content-Type": mimeTypes[extname(targetPath)] || "application/octet-stream",
        "Content-Length": contents.length,
      });
      response.end(request.method === "HEAD" ? undefined : contents);
    } catch (error) {
      console.error("HTTP request failed:", error);
      response.writeHead(500).end("Internal server error");
    }
  });
}

const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcastRoom(room, message) {
  send(room.host, message);
  if (room.guest) send(room.guest, message);
}

function createRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => (
      roomCodeCharacters[Math.floor(Math.random() * roomCodeCharacters.length)]
    )).join("");
  } while (rooms.has(code));
  return code;
}

function detach(socket) {
  const connection = connections.get(socket);
  if (!connection) return;
  connections.delete(socket);

  const room = rooms.get(connection.roomCode);
  if (!room) return;

  if (connection.player === 1) {
    rooms.delete(connection.roomCode);
    if (room.guest) send(room.guest, { type: "peer-left", reason: "host-disconnected" });
    return;
  }

  room.guest = null;
  room.started = false;
  send(room.host, {
    type: "peer-input",
    input: { moveX: 0, moveY: 0, fire: false },
  });
  broadcastRoom(room, {
    type: "room-state",
    roomCode: connection.roomCode,
    playerCount: 1,
    started: false,
  });
  send(room.host, { type: "peer-left", reason: "guest-disconnected" });
}

function parseInput(input) {
  return {
    moveX: Math.max(-1, Math.min(1, Number(input?.moveX) || 0)),
    moveY: Math.max(-1, Math.min(1, Number(input?.moveY) || 0)),
    fire: Boolean(input?.fire),
  };
}

websocketServer.on("connection", (socket) => {
  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(socket, { type: "error", message: "不正なメッセージです。" });
      return;
    }

    const connection = connections.get(socket);
    if (message.type === "create-room") {
      if (connection) {
        send(socket, { type: "error", message: "すでにルームに参加しています。" });
        return;
      }
      const roomCode = createRoomCode();
      rooms.set(roomCode, { host: socket, guest: null, started: false });
      connections.set(socket, { roomCode, player: 1 });
      send(socket, { type: "joined", roomCode, player: 1, playerCount: 1 });
      return;
    }

    if (message.type === "join-room") {
      if (connection) {
        send(socket, { type: "error", message: "すでにルームに参加しています。" });
        return;
      }
      const roomCode = String(message.roomCode || "").trim().toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) {
        send(socket, { type: "error", message: "ルームが見つかりません。コードを確認してください。" });
        return;
      }
      if (room.guest || room.started) {
        send(socket, { type: "error", message: "このルームには参加できません。" });
        return;
      }
      room.guest = socket;
      connections.set(socket, { roomCode, player: 2 });
      send(socket, { type: "joined", roomCode, player: 2, playerCount: 2 });
      broadcastRoom(room, { type: "room-state", roomCode, playerCount: 2, started: false });
      return;
    }

    if (!connection) {
      send(socket, { type: "error", message: "先にルームを作成するか参加してください。" });
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      send(socket, { type: "peer-left", reason: "room-closed" });
      return;
    }

    if (message.type === "start-game") {
      if (connection.player !== 1 || !room.guest) {
        send(socket, { type: "error", message: "相手が参加してから開始できます。" });
        return;
      }
      if (!room.started) {
        room.started = true;
        broadcastRoom(room, { type: "game-start" });
      }
      return;
    }

    if (message.type === "input" && connection.player === 2 && room.started) {
      send(room.host, { type: "peer-input", input: parseInput(message.input) });
      return;
    }

    if (message.type === "snapshot" && connection.player === 1 && room.started) {
      if (room.guest) send(room.guest, { type: "game-snapshot", snapshot: message.snapshot });
      if (message.snapshot?.state === "gameover") {
        room.started = false;
        broadcastRoom(room, { type: "game-over" });
      }
    }
  });

  socket.on("close", () => detach(socket));
  socket.on("error", (error) => console.error("WebSocket connection error:", error.message));
});

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url, "http://localhost").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit("connection", websocket, request);
  });
});

server.listen(port, () => {
  console.log(`STARFALL ${isDevelopment ? "development" : "production"} server listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    websocketServer.close();
    if (vite) await vite.close();
    server.close(() => process.exit(0));
  });
}
