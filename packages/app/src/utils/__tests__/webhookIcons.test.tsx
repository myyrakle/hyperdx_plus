import {
  WebhookApiData,
  WebhookService,
} from '@hyperdx/common-utils/dist/types';

import {
  getWebhookChannelIcon,
  getWebhookServiceConfig,
  getWebhookServiceName,
  groupWebhooksByService,
} from '@/utils/webhookIcons';

describe('webhook service metadata', () => {
  it('names the advanced Slack service distinctly from plain Slack', () => {
    expect(getWebhookServiceName(WebhookService.SlackAdvanced)).toBe(
      'Slack (Advanced)',
    );
    expect(getWebhookServiceName(WebhookService.Slack)).toBe('Slack');
  });

  it('orders the advanced Slack service right after plain Slack', () => {
    const slackOrder = getWebhookServiceConfig(WebhookService.Slack)!.order;
    const advancedOrder = getWebhookServiceConfig(
      WebhookService.SlackAdvanced,
    )!.order;
    const genericOrder = getWebhookServiceConfig(WebhookService.Generic)!.order;

    expect(advancedOrder).toBeGreaterThan(slackOrder);
    expect(advancedOrder).toBeLessThan(genericOrder);
  });

  it('gives the advanced Slack service its own channel icon entry', () => {
    // Falling through to the Generic icon would silently mislabel the channel.
    expect(getWebhookChannelIcon(WebhookService.SlackAdvanced)).not.toBe(
      getWebhookChannelIcon(WebhookService.Generic),
    );
  });

  it('groups advanced Slack webhooks separately from plain Slack', () => {
    const webhooks = [
      { service: WebhookService.Generic, name: 'g' },
      { service: WebhookService.SlackAdvanced, name: 'a' },
      { service: WebhookService.Slack, name: 's' },
    ] as WebhookApiData[];

    expect(
      groupWebhooksByService(webhooks).map(([service]) => service),
    ).toEqual([
      WebhookService.Slack,
      WebhookService.SlackAdvanced,
      WebhookService.Generic,
    ]);
  });
});
