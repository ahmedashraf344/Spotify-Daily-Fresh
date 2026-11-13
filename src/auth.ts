import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { URL } from "node:url";
import open from "open";
import {
  TOKENS_PATH,
  clientId,
  clientSecret,
  loadTokensFile,
  redirectUri,
  env,
} from "./config.js";

const SCOPES = [
  "user-top-read",
  "user-read-recently-played",
  "user-library-read",
  "playlist-modify-private",
  "playlist-modify-public",
  "playlist-read-private",
  "user-follow-read",
].join(" ");

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

function saveTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}) {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

async function exchangeToken(body: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token error ${res.status}: ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/** One-time browser login; writes .tokens.json + prints refresh token. */
export async function loginInteractive(): Promise<void> {
  const redirect = redirectUri();
  const redirectUrl = new URL(redirect);
  const port = Number(redirectUrl.port || 8787);
  const state = Math.random().toString(36).slice(2);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirect);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("show_dialog", "true");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const u = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (u.pathname !== redirectUrl.pathname) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const err = u.searchParams.get("error");
        if (err) {
          res.writeHead(400);
          res.end(`Auth error: ${err}`);
          reject(new Error(err));
          server.close();
          return;
        }
        if (u.searchParams.get("state") !== state) {
          res.writeHead(400);
          res.end("Invalid state");
          reject(new Error("Invalid OAuth state"));
          server.close();
          return;
        }
        const got = u.searchParams.get("code");
        if (!got) {
          res.writeHead(400);
          res.end("Missing code");
          reject(new Error("Missing code"));
          server.close();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Spotify Fresh connected</h1><p>You can close this tab.</p></body></html>",
        );
        resolve(got);
        server.close();
      } catch (e) {
        reject(e);
        server.close();
      }
    });
    server.listen(port, "127.0.0.1", () => {
      console.log(`Listening on ${redirect}`);
      console.log("Opening Spotify authorize…");
      void open(authUrl.toString());
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });

  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
  );
  if (!tokens.refresh_token) {
    throw new Error("No refresh_token returned — revoke app access and retry login.");
  }
  const expires_at = Date.now() + tokens.expires_in * 1000 - 30_000;
  saveTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at,
  });
  console.log(`Saved tokens → ${TOKENS_PATH}`);
  console.log("");
  console.log("Add this to GitHub Actions secrets as SPOTIFY_REFRESH_TOKEN:");
  console.log(tokens.refresh_token);
}

function refreshTokenValue(): string {
  const fromEnv = env("SPOTIFY_REFRESH_TOKEN");
  if (fromEnv) return fromEnv;
  const file = loadTokensFile();
  if (file.refresh_token) return file.refresh_token;
  throw new Error(
    "No refresh token. Run `npm run login` or set SPOTIFY_REFRESH_TOKEN.",
  );
}

/** Returns a valid access token, refreshing when needed. */
export async function getAccessToken(): Promise<string> {
  const file = loadTokensFile();
  if (
    file.access_token &&
    file.expires_at &&
    Date.now() < file.expires_at &&
    file.refresh_token
  ) {
    return file.access_token;
  }

  const refresh_token = refreshTokenValue();
  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    }),
  );
  const nextRefresh = tokens.refresh_token ?? refresh_token;
  const expires_at = Date.now() + tokens.expires_in * 1000 - 30_000;
  saveTokens({
    access_token: tokens.access_token,
    refresh_token: nextRefresh,
    expires_at,
  });
  return tokens.access_token;
}
