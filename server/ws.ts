import "./env";
import http from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import {
  InterviewOrchestrator,
  type Emit,
  type EmitAudio,
} from "./interviewer";
import type { ClientMessage } from "../types/interview";

const PORT = Number(process.env.PORT || process.env.WS_PORT || 3002);

/* Plain HTTP for health checks (Railway/Render) + a friendly root page. */
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("InterviewIQ realtime server — OK");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

wss.on("connection", (ws) => {
  const emit: Emit = (msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const emitAudio: EmitAudio = (buf) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(buf, { binary: true });
  };

  const orchestrator = new InterviewOrchestrator(emit, emitAudio);
  emit({ type: "status", state: "connected" });

  ws.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      orchestrator.handleAudio(toBuffer(data));
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "interview:start":
        orchestrator.start(msg).catch((err) => {
          console.error("[start]", err);
          emit({
            type: "error",
            fatal: true,
            message: "Failed to start the interview.",
          });
        });
        break;
      case "vision:frame":
        orchestrator.handleVisionFrame(msg.data);
        break;
      case "playback:complete":
        orchestrator.handlePlaybackComplete();
        break;
      case "cv:metrics":
        orchestrator.handleCvMetrics(msg.metrics);
        break;
      case "interview:end":
        orchestrator.end();
        break;
      default:
        break;
    }
  });

  ws.on("close", () => orchestrator.dispose());
  ws.on("error", () => orchestrator.dispose());
});

server.listen(PORT, () => {
  console.log(`▶ InterviewIQ realtime server listening on :${PORT}`);
});

process.on("unhandledRejection", (reason) => {
  console.warn("[unhandledRejection]", reason);
});

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
