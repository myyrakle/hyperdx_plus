import { formatFieldLabel, renderMention } from '@/tasks/checkAlerts/message';

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

describe('renderMention', () => {
  it('renders the here broadcast', () => {
    expect(renderMention('here')).toBe('<!here>');
  });

  it('renders the channel broadcast', () => {
    expect(renderMention('channel')).toBe('<!channel>');
  });

  it('renders nothing when no mention is configured', () => {
    expect(renderMention(undefined)).toBeUndefined();
  });

  it('renders nothing for an unrecognised value', () => {
    // Stored data predating a value change should not emit a literal string
    // that Slack would show as plain text.
    expect(renderMention('everyone' as any)).toBeUndefined();
  });
});
