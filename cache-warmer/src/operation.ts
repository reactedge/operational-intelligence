import { logger } from './logger';
import { OpenTelemetryObserver } from './observability/activity';

export class Operation {
    private readonly telemetry: OpenTelemetryObserver;

    private requestId = '';

    private userAgent = '';

    private traceId = '';

    private parentSpanId = '';

    constructor(telemetry: OpenTelemetryObserver) {
        this.telemetry = telemetry;
    }
    registerStart(headers: Record<string, any>): void {
        this.traceId = headers['x-trace-id'] ?? '';
        this.parentSpanId = headers['x-parent-span-id'] ?? '';
        this.userAgent = headers['user-agent'] ?? '';
        this.requestId = crypto.randomUUID();

        this.telemetry.startOperation('cache_warmer.run', headers);

        logger.info('cache_warmer.run.started', {
            requestId: this.requestId,
            traceId: this.traceId,
            parentSpanId: this.parentSpanId
        });
    }

    logObservation(payload: {
        url: string;
        check: string;
    }): void {
        logger.info('cache_warmer.observation.completed', {
            requestId: this.requestId,
            url: payload.url,
            check: payload.check,
            userAgent: this.userAgent
        });

        this.telemetry.logObservation('cache_warmer.observation.completed', {
            requestId: this.requestId,
            url: payload.url,
            check: payload.check
        });
    }

    logAssessment(result: {
        url: string;
        ready: boolean;
        issue?: string;
    }): void {
        logger.info('cache_warmer.assessment.completed', {
            requestId: this.requestId,
            url: result.url,
            ready: result.ready,
            issue: result.issue
        });

        this.telemetry.logObservation('cache_warmer.assessment.completed', {
            requestId: this.requestId,
            url: result.url,
            ready: result.ready,
            issue: result.issue
        });
    }

    logCompletion(): void {
        logger.info('cache_warmer.run.completed', {
            requestId: this.requestId
        });

        this.telemetry.endOperation();
    }

    logFailure(error: unknown): void {
        logger.error('cache_warmer.run.failed', {
            requestId: this.requestId,
            error
        });

        this.telemetry.failOperation(error);
    }

    getRequestId(): string {
        return this.requestId;
    }
}
