import { describe, expect, it } from 'vitest';
import {
  computeBaseline,
  evaluateAnomaly,
  forecastSeries,
} from '../../src/controlPlane/intelligence';

describe('computeBaseline', () => {
  it('reports a stable median and zero spread for a flat series', () => {
    const baseline = computeBaseline([10, 10, 10, 10, 10]);
    expect(baseline.samples).toBe(5);
    expect(baseline.median).toBe(10);
    expect(baseline.mad).toBe(0);
    expect(baseline.stddev).toBe(0);
    expect(baseline.p10).toBe(10);
    expect(baseline.p90).toBe(10);
  });

  it('returns honest nulls for an empty series', () => {
    const baseline = computeBaseline([]);
    expect(baseline.samples).toBe(0);
    expect(baseline.mean).toBeNull();
    expect(baseline.median).toBeNull();
    expect(baseline.min).toBeNull();
  });
});

describe('evaluateAnomaly', () => {
  const baseline = [100, 102, 98, 101, 99, 100, 101, 100, 99, 102, 98, 100];

  it('does not score the last value without enough history', () => {
    const anomaly = evaluateAnomaly({
      metricId: 'orders',
      metricLabel: 'Orders',
      unit: 'count',
      direction: 'higher_is_good',
      date: '2026-11-15',
      observed: 0,
      baselineValues: [100, 100, 100],
    });
    expect(anomaly).toBeNull();
  });

  it('marks a bad-direction drop as critical when far outside the baseline', () => {
    const anomaly = evaluateAnomaly({
      metricId: 'orders',
      metricLabel: 'Orders',
      unit: 'count',
      direction: 'higher_is_good',
      date: '2026-11-15',
      observed: 0,
      baselineValues: baseline,
    });
    expect(anomaly).not.toBeNull();
    expect(anomaly?.direction).toBe('drop');
    expect(anomaly?.severity).toBe('critical');
    expect(anomaly?.zScore).toBeLessThan(-3.5);
  });

  it('marks a spike in a higher-is-bad metric as critical when far outside the baseline', () => {
    const anomaly = evaluateAnomaly({
      metricId: 'error_events',
      metricLabel: 'Client error events',
      unit: 'count',
      direction: 'higher_is_bad',
      date: '2026-11-15',
      observed: 500,
      baselineValues: baseline,
    });
    expect(anomaly).not.toBeNull();
    expect(anomaly?.direction).toBe('spike');
    expect(anomaly?.severity).toBe('critical');
  });

  it('keeps a favourable spike as informational rather than critical', () => {
    const anomaly = evaluateAnomaly({
      metricId: 'revenue',
      metricLabel: 'Revenue',
      unit: 'currency',
      direction: 'higher_is_good',
      date: '2026-11-15',
      observed: 5000,
      baselineValues: baseline,
    });
    expect(anomaly?.direction).toBe('spike');
    expect(anomaly?.severity).toBe('info');
  });

  it('does not invent an anomaly when the value is inside the baseline', () => {
    const anomaly = evaluateAnomaly({
      metricId: 'orders',
      metricLabel: 'Orders',
      unit: 'count',
      direction: 'higher_is_good',
      date: '2026-11-15',
      observed: 101,
      baselineValues: baseline,
    });
    expect(anomaly).toBeNull();
  });
});

describe('forecastSeries', () => {
  it('fits a linear trend and projects the next value and seven-day total', () => {
    const forecast = forecastSeries([10, 12, 14, 16, 18, 20, 22], 7, 'count');
    expect(forecast.method).toBe('linear_regression');
    expect(forecast.slopePerDay).toBe(2);
    expect(forecast.nextValue).toBe(24);
    expect(forecast.next7dTotal).toBe(210);
    expect(forecast.confidence).toBe('medium');
  });

  it('refuses to forecast with fewer than three complete days', () => {
    const forecast = forecastSeries([10, 12], 7, 'count');
    expect(forecast.method).toBe('insufficient_data');
    expect(forecast.nextValue).toBeNull();
    expect(forecast.next7dTotal).toBeNull();
  });

  it('keeps percent forecasts inside zero to one hundred', () => {
    const forecast = forecastSeries([90, 95, 99], 7, 'percent');
    expect(forecast.nextValue).not.toBeNull();
    expect(forecast.nextValue).toBeLessThanOrEqual(100);
    expect(forecast.next7dTotal).toBeNull();
  });
});
