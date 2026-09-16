import app from "./app";
import { logger } from "./lib/logger";
import { appConfig } from "./config";

app.listen(appConfig.port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: appConfig.port, environment: appConfig.nodeEnv }, "Server listening");
});
