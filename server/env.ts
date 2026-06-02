/**
 * Loads environment variables for the standalone WebSocket server.
 * Next.js reads `.env.local` automatically, but this server runs under tsx, so
 * we load it explicitly. Existing process env (Railway/Vercel) always wins.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config(); // .env fallback
