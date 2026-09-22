import { logger } from './logger';

export class ErrorWrapper {
    handle = (error: unknown) => {
        if (error instanceof Error) {
            logger.error('cache_warmer.server.failed', error)
        } else {
            throw error
        }
    }
}
