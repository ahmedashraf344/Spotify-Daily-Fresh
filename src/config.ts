import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: join(root, ".env.local") });
dotenv.config({ path: join(root, ".env") });

export const ROOT = root;
export const TOKENS_PATH = join(root, ".tokens.json");
export const RUNS_LATEST_PATH = join(root, "runs", "latest.json");
export const QUERIES_PATH = join(root, "config", "queries.yaml");
export const SOURCE_PLAYLISTS_PATH = join(root, "config", "source-playlists.yaml");

export const PLAYLIST_NAME = "Fresh 40 · Daily";
export const FRESH_LIMIT = 40;

export function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example → .env and fill values.`);
  }
  return value;
}

export function loadTokensFile(): {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
} {
  if (!existsSync(TOKENS_PATH)) return {};
  return JSON.parse(readFileSync(TOKENS_PATH, "utf8")) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
}

export function clientId(): string {
  return requireEnv("SPOTIFY_CLIENT_ID");
}

export function clientSecret(): string {
  return requireEnv("SPOTIFY_CLIENT_SECRET");
}

export function redirectUri(): string {
  return env("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8787/callback");
}

export function market(): string {
  return env("SPOTIFY_MARKET", "EG");
}
