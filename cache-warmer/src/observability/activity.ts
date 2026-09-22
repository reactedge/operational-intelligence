import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {trace, type Tracer, Attributes} from "@opentelemetry/api";
import {config} from "../config";
import {Operation} from "./operation";

export class OpenTelemetryObserver {
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

    startOperation(
        name: string,
        attributes: Attributes = {}
    ): Operation {
        return new Operation(
            this.tracer.startSpan(name, {attributes})
        );
    }

    startChildOperation(
        parent: Operation,
        name: string,
        attributes: Attributes = {}
    ): Operation {
        const childSpan = this.tracer.startSpan(
            name,
            {
                attributes
            },
            parent.getContext()
        );

        return new Operation(
            childSpan
        );
    }

    logObservation(
        name: string,
        attributes: Attributes = {}
    ): void {
        this.startOperation(name, attributes).end();
    }
}
