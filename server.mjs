import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const publicRoot = new URL("./public/", import.meta.url);
const types = new Map([
  ["html", "text/html; charset=utf-8"], ["css", "text/css; charset=utf-8"],
  ["mjs", "text/javascript; charset=utf-8"], ["webp", "image/webp"]
]);
const port = Number(process.env.GUEST_SITE_PORT || 3003);
const backend = new URL(process.env.GUEST_API_ORIGIN || "http://localhost:3500");
if (!["http:", "https:"].includes(backend.protocol) || backend.username || backend.password) throw new Error("Configure a valid backend HTTP(S) origin.");
if (process.env.NODE_ENV === "production" && backend.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)) throw new Error("The production PMS connection must use HTTPS.");
const propertyId = process.env.GUEST_PROPERTY_ID || "hotel-3085ce35-58f8-4a91-bfea-3b33589f5048";
if (!/^[a-z\d][a-z\d_-]{0,99}$/i.test(propertyId)) throw new Error("Configure a valid property ID.");
// This secret is never included in served files, responses or browser config.
const websiteKey = process.env.GUEST_IBE_API_KEY || "";

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(payload));
}

async function proxy(request, response, url) {
  const match = /^\/api\/ibe\/([a-z\d][a-z\d_-]{0,99})(\/(?:availability|bookings))?$/.exec(url.pathname);
  if (!match || match[1] !== propertyId) return json(response, 404, { message: "Booking page unavailable." });
  const endpoint = match[2] || "";
  if (request.method !== (endpoint === "/bookings" ? "POST" : "GET")) return json(response, 405, { message: "Method unavailable." });
  if (!/^ibe_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(websiteKey)) return json(response, 503, { message: "The hotel website connection is not configured. Please contact the hotel." });
  const headers = { "X-IBE-API-Key": websiteKey };
  let body;
  if (request.method === "POST") {
    // Cross-site browser forms must not trigger bookings through this proxy.
    if (request.headers.origin) {
      let sameHost = false;
      try { sameHost = new URL(request.headers.origin).host === request.headers.host; } catch {}
      if (!sameHost) return json(response, 403, { message: "Submit the booking from this hotel website." });
    }
    if (request.headers["sec-fetch-site"] === "cross-site") return json(response, 403, { message: "Submit the booking from this hotel website." });
    if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) return json(response, 415, { message: "Send a JSON booking request." });
    const parts = [];
    let bytes = 0;
    for await (const part of request) {
      bytes += part.length;
      if (bytes > 8192) return json(response, 413, { message: "Booking request is too large." });
      parts.push(part);
    }
    body = Buffer.concat(parts);
    headers["Content-Type"] = "application/json";
  }
  const upstream = await fetch(backend.origin + "/api/public/ibe/" + encodeURIComponent(propertyId) + endpoint + url.search, {
    method: request.method, headers, body, signal: AbortSignal.timeout(15000), redirect: "error"
  });
  if (upstream.status === 401) return json(response, 503, { message: "The hotel website connection needs attention. Please contact the hotel." });
  if (upstream.headers.has("retry-after")) response.setHeader("Retry-After", upstream.headers.get("retry-after"));
  return json(response, upstream.status, await upstream.json());
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await proxy(request, response, url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const pathname = url.pathname;
    if (pathname === "/guest-config.mjs") {
      const body = "export const apiOrigin = '';\nexport const propertyId = " + JSON.stringify(propertyId) + ";";
      response.writeHead(200, { "Content-Type": types.get("mjs"), "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    const bookingPage = /^\/book\/[a-z\d][a-z\d_-]{0,99}\/?$/i.test(pathname);
    const route = bookingPage ? "/booking.html" : pathname === "/" ? "/index.html" : pathname;
    const type = types.get(route.split(".").at(-1));
    if (!type || !/^\/(?:images\/)?[a-z\d-]+\.(?:html|css|mjs|webp)$/.test(route)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const file = new URL(route.slice(1), publicRoot);
    const info = await stat(file);
    if (!info.isFile()) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, {
      "Content-Type": type, "Content-Length": info.size, "X-Content-Type-Options": "nosniff",
      ...(bookingPage ? { "Referrer-Policy": "strict-origin",
        "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self'"
      } : {})
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).on("error", () => response.destroy()).pipe(response);
  } catch (error) {
    if (response.headersSent) { response.destroy(); return; }
    if (request.url.startsWith("/api/")) return json(response, 503, { message: "Online booking is temporarily unavailable. Please try again." });
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Page unavailable");
  }
});

server.listen(port, "127.0.0.1", () => console.log("Guest booking preview: http://localhost:" + port));
