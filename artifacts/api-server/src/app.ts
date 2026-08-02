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
// Allows Replit-hosted frontends (*.replit.app, *.replit.dev) and localhost for development.
const TRUSTED_ORIGIN_RE = /^https?:\/\/(localhost(:\d+)?|[^/]+\.replit\.(app|dev))(\/.*)?$/;
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Same-origin or server-to-server requests have no Origin header — allow them.
      if (!origin) return callback(null, true);
      if (TRUSTED_ORIGIN_RE.test(origin)) return callback(null, true);
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

const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/", (_, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
