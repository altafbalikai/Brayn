/**
 * Vercel Serverless Entry
 * -----------------------
 * This file converts existing Express app into a serverless function.
 */

const app = require('../src/app');
const logger = require('../src/config/logger');
const { connect } = require('../src/db/mongoose');

// Ensure DB is connected on cold start
let isDbConnected = false;

module.exports = async (req, res) => {
    try {
        if (!isDbConnected) {
            await connect();
            isDbConnected = true;
        }

        return app(req, res);
    } catch (error) {
        logger.error('Serverless handler error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
        });
    }
};
