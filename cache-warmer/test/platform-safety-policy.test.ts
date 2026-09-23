import assert from 'node:assert/strict';
import test from 'node:test';
import {PerformanceEntry} from '../src/model/performance/types';
import {PlatformSafetyPolicy} from '../src/model/platform/platform-safety-policy';
import {PlatformSignals} from '../src/model/platform/types';

const healthyResult = (url: string): PerformanceEntry => ({
    id: url,
    label: url,
    url,
    durationMs: 100,
    healthy: true,
    status: 200
});

const platformSignals = (): PlatformSignals => ({
    timestamp: '2026-09-23T12:00:00Z',
    platform: {
        hostname: 'localhost',
        environment: 'test',
        service: 'platform-signals',
        version: '0.1.0'
    },
    signals: {
        cpu: {usagePercent: 10},
        memory: {usagePercent: 20},
        disk: {usagePercent: 30},
        redis: {connected: true},
        varnish: {connected: true}
    }
});

const policy = new PlatformSafetyPolicy({
    maxCpuPercent: 85,
    maxMemoryPercent: 85,
    maxDiskPercent: 90
});

test('allows the next batch after a healthy completed batch', () => {
    const decision = policy.evaluate(
        [healthyResult('https://example.com/one'), healthyResult('https://example.com/two')],
        platformSignals()
    );

    assert.deepEqual(decision, {allowed: true, reasons: []});
});

test('rejects the next batch when any URL in the completed batch failed', () => {
    const failed = {
        ...healthyResult('https://example.com/two'),
        healthy: false,
        status: 500
    };
    const decision = policy.evaluate(
        [healthyResult('https://example.com/one'), failed],
        platformSignals()
    );

    assert.equal(decision.allowed, false);
    assert.match(decision.reasons[0], /1 URL\(s\) in the completed batch/);
});

test('rejects the next batch when post-batch platform signals breach policy', () => {
    const signals = platformSignals();
    signals.signals.cpu.usagePercent = 90;
    const decision = policy.evaluate(
        [healthyResult('https://example.com/one')],
        signals
    );

    assert.equal(decision.allowed, false);
    assert.match(decision.reasons[0], /CPU usage 90% exceeds 85%/);
});
