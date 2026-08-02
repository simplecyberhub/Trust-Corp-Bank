import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app: Express = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Restrict CORS to known trusted origins rather than reflecting any origin.
// Allows Replit-hosted frontends (*.replit.app, *.replit.dev), Render (*.onrender.com),
// and any custom domain set via ALLOWED_ORIGIN env var, plus localhost for development.
const EXTRA_ORIGIN = process.env.ALLOWED_ORIGIN;
const TRUSTED_ORIGIN_RE =
  /^https?:\/\/(localhost(:\d+)?|[^/]+\.replit\.(app|dev)|[^/]+\.onrender\.com)(\/.*)?$/;
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Same-origin or server-to-server requests have no Origin header — allow them.
      if (!origin) return callback(null, true);
      if (TRUSTED_ORIGIN_RE.test(origin)) return callback(null, true);
      if (EXTRA_ORIGIN && origin === EXTRA_ORIGIN) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Serve the trust-corp-bank SPA.
// The Vite build outputs directly into this directory:
//   artifacts/trust-corp-bank/vite.config.ts → outDir: ../api-server/dist/public
// so at runtime __dirname/public is the built frontend.
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

// SPA fallback — any unmatched GET returns index.html so client-side routing works.
app.get("/*path", (_, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
