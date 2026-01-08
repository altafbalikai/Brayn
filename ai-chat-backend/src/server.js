process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", error);
});

const app = require('./app');
const { connect } = require('./db/mongoose');
const logger = require('./config/logger');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await connect();
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
