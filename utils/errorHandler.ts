import { logError } from './database.js';
import { PROCESS_EVENT_UNHANDLED_REJECTION, PROCESS_EVENT_UNCAUGHT_EXCEPTION } from './constants/index.js';

/**
 * Registers listeners for global process-level errors to ensure they are logged and 
 * the bot remains as stable as possible.
 */
export function registerProcessHandlers() {
    process.on(PROCESS_EVENT_UNHANDLED_REJECTION, (reason, promise) => {
        console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
        logError(reason, { method: PROCESS_EVENT_UNHANDLED_REJECTION });
    });

    process.on(PROCESS_EVENT_UNCAUGHT_EXCEPTION, (error) => {
        console.error('[Uncaught Exception] thrown:', error);
        logError(error, { method: PROCESS_EVENT_UNCAUGHT_EXCEPTION });
    });
}
