import {OpenTelemetryObserver} from '../../observability/activity';
import {Operation} from '../../observability/operation';

export class CacheWarmerClient {
    constructor(
        private readonly url: string,
        private readonly timeoutMs: number
    ) {}

    async warm(
        urls: string[],
        telemetry: OpenTelemetryObserver,
        parentOperation: Operation
    ): Promise<unknown> {
        const operation = telemetry.startChildOperation(
            parentOperation,
            'sitemap_planner.delegate_cache_warmer',
            {
                'url.full': this.url,
                'cache_warmer.url.count': urls.length
            }
        );

        try {
            const response = await fetch(this.url, {
                method: 'POST',
                signal: AbortSignal.timeout(this.timeoutMs),
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({urls})
            });
            operation.setAttribute('http.response.status_code', response.status);
            const body = await response.json() as unknown;

            if (!response.ok) {
                throw new Error(`Cache warmer returned HTTP ${response.status}.`);
            }

            operation.succeed();
            return body;
        } catch (error) {
            operation.fail(error);
            throw error;
        }
    }
}
