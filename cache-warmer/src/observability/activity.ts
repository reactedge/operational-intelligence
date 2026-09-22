import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {trace, type Tracer, SpanStatusCode, Span, context, Attributes} from "@opentelemetry/api";
import {config} from "../config";
import {Operation} from "./operation";

export class OpenTelemetryObserver {
    private span?: Span

    private tracer: Tracer
    constructor() {
        const exporter = new OTLPTraceExporter({
            url: `${config.observability.otelHost}/v1/traces`
        });

        const provider = new NodeTracerProvider({
            resource: resourceFromAttributes({
                'service.name': config.observability.serviceName,
                'service.version': '1.0.0'
            }),
            spanProcessors: [
                new BatchSpanProcessor(exporter)
            ]
        });

        provider.register();

        this.tracer = trace.getTracer(config.observability.serviceName);
    }

    startOperation(name: string, headers: Request['headers']): void {
        this.span =
            this.tracer.startSpan(
                name
            );

        this.logObservation('request_headers', headers)
    }

    startChildOperation(
        name: string,
        attributes: Attributes = {}
    ): Operation {
        if (!this.span) {
            throw new Error(
                'Cannot create child operation without an active parent operation.'
            );
        }

        const childSpan = this.tracer.startSpan(
            name,
            {
                attributes
            },
            trace.setSpan(context.active(), this.span)
        );

        return new Operation(
            childSpan
        );
    }

    endOperation() {
        if (this.span === undefined) {
            throw new Error('No operation was started')
        }

        this.span.end();
    }

    failOperation(error: unknown) {
        if (this.span === undefined) {
            throw new Error('No operation was started')
        }

        this.span.recordException(
            error as Error
        );

        this.span.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(error)
        });

        this.span.end();
    }

    logObservation(
        name: string,
        payload: Record<string, any>
    ) {
        if (this.span === undefined) {
            throw new Error('No operation was started')
        }

        this.span.addEvent(
            name,
            payload
        );
    }
}
