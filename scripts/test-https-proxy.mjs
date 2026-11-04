import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const port = Number(process.env.HOUSTON_TEST_HTTPS_PORT ?? 3443);
const upstreamPort = Number(process.env.HOUSTON_TEST_UPSTREAM_PORT ?? 3000);
const pfxPath = process.env.HOUSTON_TEST_TLS_PFX;
const passphrase = process.env.HOUSTON_TEST_TLS_PASSPHRASE;

if (!pfxPath || !passphrase) throw new Error("HOUSTON_TEST_TLS_PFX and HOUSTON_TEST_TLS_PASSPHRASE are required");

const server = https.createServer({ pfx: readFileSync(pfxPath), passphrase }, (request, response) => {
  const headers = {
    ...request.headers,
    host: request.headers.host ?? `localhost:${port}`,
    "x-forwarded-proto": "https",
    "x-forwarded-host": request.headers.host ?? `localhost:${port}`,
  };
  const upstream = http.request({
    host: "127.0.0.1",
    port: upstreamPort,
    method: request.method,
    path: request.url,
    headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", (error) => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Test proxy error: ${error.message}`);
  });
  request.pipe(upstream);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Houston test HTTPS proxy ready at https://localhost:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
