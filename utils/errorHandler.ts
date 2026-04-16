import { logError } from './database.js';

/**
 * Registers listeners for global process-level errors to ensure they are logged and 
 * the bot remains as stable as possible.
 */
export function registerProcessHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
        logError(reason, { method: 'unhandledRejection' });
    });

    process.on('uncaughtException', (error) => {
        console.error('[Uncaught Exception] thrown:', error);
        logError(error, { method: 'uncaughtException' });
    });
}
