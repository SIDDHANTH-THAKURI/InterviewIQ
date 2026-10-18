/**
 * InterviewIQ server: Next.js app + realtime interview WebSocket on ONE port,
 * so a single URL (localhost, a tunnel, or a host) serves everything.
 *
 *   npm run dev     → development (hot reload for the app)
 *   npm run build && npm start → production
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import http from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { InterviewSession } from "./interviewer";
import { verifyPass, adminPasscodeConfigured, type Member } from "../lib/server/access";
import { byokEnabled, ownerKeys, visitorKeys, type ProviderKeys } from "../lib/server/keys";
import { REALTIME_PATH, type ClientMessage } from "../types/interview";

const prod = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";

async function main() {
  const app = next({ dev: !prod, hostname: "localhost", port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const nextUpgrade = app.getUpgradeHandler();

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    handle(req, res, parse(req.url || "/", true));
  });

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 4 * 1024 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "/");
    if (pathname === REALTIME_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      // Next.js dev HMR and anything else Next handles.
      nextUpgrade(req, socket, head);
    }
  });

  wss.on("connection", (ws) => {
    const emit = (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const emitAudio = (buf: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buf, { binary: true });
    };
    const session = new InterviewSession(emit, emitAudio);
    let started = false;
    emit({ type: "status", state: "connected" });

    // Close idle sockets that never authenticate.
    const authTimer = setTimeout(() => {
      if (!started) ws.close(4401, "unauthenticated");
    }, 15000);

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (started) session.handleAudio(toBuffer(data));
        return;
      }
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === "interview:start") {
        if (started) return;
        // Invite → owner's keys. Otherwise → only the visitor's own keys, never the owner's.
        let member: Member | null = null;
        let keys: ProviderKeys | null = null;
        if (msg.pass) {
          const v = verifyPass(msg.pass);
          if (!v.ok) {
            emit({ type: "error", fatal: true, code: "auth", message: "Your invite link is no longer valid." });
            ws.close(4401, "unauthenticated");
            return;
          }
          member = v.member;
          keys = ownerKeys();
        } else if (byokEnabled()) {
          keys = visitorKeys(msg.keys);
        }
        if (!keys) {
          emit({ type: "error", fatal: true, code: "auth", message: "Open your invite link, or add your own API keys." });
          ws.close(4401, "unauthenticated");
          return;
        }
        delete msg.keys; // keep keys out of anything the session might log or echo
        started = true;
        clearTimeout(authTimer);
        session.start(msg, { member, keys }).catch((err) => {
          console.error("[start]", err);
          emit({ type: "error", fatal: true, message: "Couldn't start the interview. Please try again." });
        });
        return;
      }
      if (!started) return;
      switch (msg.type) {
        case "vision:frame":
          session.handleVisionFrame(msg.data);
          break;
        case "cv:metrics":
          session.handleCvMetrics(msg.metrics);
          break;
        case "playback:complete":
          session.handlePlaybackComplete();
          break;
        case "candidate:text":
          session.handleText(msg.text);
          break;
        case "control:repeat":
        case "control:hint":
        case "control:skip":
        case "control:pause":
        case "control:resume":
          void session.handleControl(msg.type.slice("control:".length) as "repeat");
          break;
        case "interview:end":
          session.end();
          break;
      }
    });

    const close = () => {
      clearTimeout(authTimer);
      session.dispose();
    };
    ws.on("close", close);
    ws.on("error", close);
  });

  server.listen(port, hostname, () => {
    console.log(`\n  ▲ InterviewIQ ${prod ? "(production)" : "(dev)"} → http://localhost:${port}`);
    if (!adminPasscodeConfigured()) {
      console.warn("  ⚠ ADMIN_PASSCODE is not set in .env.local — the admin console is locked.");
    }
    const missing = ["ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY"].filter((k) => !process.env[k]);
    if (missing.length) console.warn(`  ⚠ Missing keys: ${missing.join(", ")}`);
  });
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}

process.on("unhandledRejection", (reason) => console.warn("[unhandledRejection]", reason));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
