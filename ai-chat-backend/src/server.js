process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:");
  console.error(err.stack || err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 UNHANDLED PROMISE REJECTION:");
  console.error(reason);
  process.exit(1);
});

const app = require('./app');
const { connect } = require('./db/mongoose');
const logger = require('./config/logger');
const { ensureQdrantCollection } = require("./config/qdrant.js");
const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await connect();
    await ensureQdrantCollection();
    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error('Startup error:', err);
    process.exit(1);
  }
}

start().catch(err => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});
