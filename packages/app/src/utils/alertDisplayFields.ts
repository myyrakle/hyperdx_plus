import { WebhookService } from '@hyperdx/common-utils/dist/types';

/**
 * Whether the alert's destination renders `displayFields`.
 *
 * Only the advanced Slack service does. Showing the input for other services
 * would offer a setting that is silently ignored.
 */
export const webhookSupportsDisplayFields = (
  webhooks: Array<{ _id: string; service: WebhookService }> | undefined,
  webhookId: string | undefined,
): boolean => {
  if (!webhookId || !webhooks) {
    return false;
  }
  return (
    webhooks.find(webhook => webhook._id === webhookId)?.service ===
    WebhookService.SlackAdvanced
  );
};
