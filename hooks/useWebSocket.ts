"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/types/interview";

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

interface UseWebSocketOptions {
  url: string;
  /** Typed control messages (JSON text frames). */
  onMessage?: (msg: ServerMessage) => void;
  /** Raw binary frames (TTS PCM audio). */
  onBinary?: (data: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  onBinary,
  onOpen,
  onClose,
  onError,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>("idle");

  // Keep latest callbacks in refs so connect() doesn't need them as deps.
  const cbs = useRef({ onMessage, onBinary, onOpen, onClose, onError });
  cbs.current = { onMessage, onBinary, onOpen, onClose, onError };

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    setStatus("connecting");
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      cbs.current.onOpen?.();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          cbs.current.onMessage?.(JSON.parse(ev.data) as ServerMessage);
        } catch {
          /* ignore malformed control frame */
        }
      } else if (ev.data instanceof ArrayBuffer) {
        cbs.current.onBinary?.(ev.data);
      }
    };
    ws.onerror = () => {
      setStatus("error");
      cbs.current.onError?.();
    };
    ws.onclose = (ev) => {
      setStatus("closed");
      cbs.current.onClose?.(ev);
    };
  }, [url]);

  const disconnect = useCallback((code = 1000, reason = "client closing") => {
    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(code, reason);
      } catch {
        /* noop */
      }
    }
    wsRef.current = null;
  }, []);

  const sendJSON = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      return true;
    }
    return false;
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        wsRef.current = null;
      }
    };
  }, []);

  return { connect, disconnect, sendJSON, sendBinary, status };
}
