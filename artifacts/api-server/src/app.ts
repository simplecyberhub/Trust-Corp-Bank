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

// CORS configuration
const EXTRA_ORIGIN = process.env.ALLOWED_ORIGIN;

const TRUSTED_ORIGIN_RE =
  /^https?:\/\/(localhost(:\d+)?|[^/]+\.replit\.(app|dev)|[^/]+\.onrender\.com)(\/.*)?$/;

app.use(
  cors({
    credentials: true,

    origin: (origin, callback) => {
      // Same-origin or server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (TRUSTED_ORIGIN_RE.test(origin)) {
        return callback(null, true);
      }

      if (EXTRA_ORIGIN && origin === EXTRA_ORIGIN) {
        return callback(null, true);
      }

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

// ============================================================
// API
// ============================================================

app.use("/api", router);

// ============================================================
// MAIN BANKING APPLICATION
// ============================================================
//
// The main Vite application builds into:
//
// artifacts/api-server/dist/public
//
// At runtime:
//
// __dirname = artifacts/api-server/dist
//
// Therefore:
//
// publicDir = artifacts/api-server/dist/public
// ============================================================

const publicDir = path.join(__dirname, "public");

// ============================================================
// ADMIN APPLICATION
// ============================================================
//
// The admin Vite application builds into:
//
// artifacts/admin/dist/public
//
// From:
//
// artifacts/api-server/dist
//
// we go:
//
// ../../admin/dist/public
// ============================================================

const adminPublicDir = path.resolve(
  __dirname,
  "../../admin/dist/public",
);

// ============================================================
// ADMIN ROUTES
// ============================================================
//
// IMPORTANT:
// These routes MUST appear before the main "*" SPA fallback.
// Otherwise /admin will be handled by the banking application.
// ============================================================

app.use(
  "/admin",
  express.static(adminPublicDir),
);

// Handles:
//
// /admin
// /admin/
// /admin/login
// /admin/dashboard
// /admin/users
// /admin/settings
// etc.
//

app.get("/admin", (_, res) => {
  res.sendFile(path.join(adminPublicDir, "index.html"));
});

app.get("/admin/*path", (_, res) => {
  res.sendFile(path.join(adminPublicDir, "index.html"));
});

// ============================================================
// MAIN BANKING APPLICATION
// ============================================================

app.use(express.static(publicDir));

// Main SPA fallback.
//
// This MUST remain AFTER the /admin routes above.

app.get("/*path", (req, res) => {
  // Prevent API requests from accidentally receiving the frontend.
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      message: "API endpoint not found",
    });
  }

  // Prevent unknown /admin requests from falling through
  // to the main banking application.
  if (req.path === "/admin" || req.path.startsWith("/admin/")) {
    return res.status(404).send("Admin route not found");
  }

  return res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
