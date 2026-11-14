import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function devShots(): Plugin {
  return {
    name: "dev-shots",
    apply: "serve",
    configureServer(server) {
      server.watcher.on("error", (e) => console.warn("watcher:", (e as Error).message));
      server.middlewares.use("/__shot", (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const dir = path.resolve(__dirname, "../notes/images");
          fs.mkdirSync(dir, { recursive: true });
          const name = (req.url ?? "").replace(/[^a-z0-9_-]/gi, "") || "shot";
          fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.from(body, "base64"));
          res.end("ok");
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), devShots()],
  server: { port: 5173, watch: { usePolling: true, interval: 300 } },
});
