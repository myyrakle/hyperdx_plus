import { formatFieldLabel } from '@/tasks/checkAlerts/message';

describe('formatFieldLabel', () => {
  it('uses a plain column name as-is', () => {
    expect(formatFieldLabel('ServiceName')).toBe('ServiceName');
  });

  it('unwraps a bracketed map key', () => {
    expect(formatFieldLabel("SpanAttributes['exception.message']")).toBe(
      'exception.message',
    );
  });

  it('tolerates whitespace inside the brackets', () => {
    expect(formatFieldLabel("SpanAttributes[ 'k8s.pod.name' ]")).toBe(
      'k8s.pod.name',
    );
  });

  it('unwraps only the trailing key of a chained access', () => {
    expect(formatFieldLabel("a['b']['c']")).toBe('c');
  });

  it('keeps a function call intact', () => {
    expect(formatFieldLabel('toString(SeverityNumber)')).toBe(
      'toString(SeverityNumber)',
    );
  });

  it('keeps an aliased expression intact', () => {
    expect(formatFieldLabel("SpanAttributes['x'] AS thing")).toBe(
      "SpanAttributes['x'] AS thing",
    );
  });
});
