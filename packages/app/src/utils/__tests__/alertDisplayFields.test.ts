import { WebhookService } from '@hyperdx/common-utils/dist/types';

import { webhookSupportsDisplayFields } from '@/utils/alertDisplayFields';

const webhooks = [
  { _id: 'w-plain', service: WebhookService.Slack },
  { _id: 'w-advanced', service: WebhookService.SlackError },
  { _id: 'w-generic', service: WebhookService.Generic },
];

describe('webhookSupportsDisplayFields', () => {
  it('is true for a Slack (Error) webhook', () => {
    expect(webhookSupportsDisplayFields(webhooks, 'w-advanced')).toBe(true);
  });

  it('is false for services that ignore display fields', () => {
    expect(webhookSupportsDisplayFields(webhooks, 'w-plain')).toBe(false);
    expect(webhookSupportsDisplayFields(webhooks, 'w-generic')).toBe(false);
  });

  it('is false when no webhook is selected yet', () => {
    expect(webhookSupportsDisplayFields(webhooks, undefined)).toBe(false);
    expect(webhookSupportsDisplayFields(webhooks, '')).toBe(false);
  });

  it('is false when the webhook list has not loaded', () => {
    expect(webhookSupportsDisplayFields(undefined, 'w-advanced')).toBe(false);
  });

  it('is false when the selected webhook no longer exists', () => {
    expect(webhookSupportsDisplayFields(webhooks, 'w-deleted')).toBe(false);
  });
});
