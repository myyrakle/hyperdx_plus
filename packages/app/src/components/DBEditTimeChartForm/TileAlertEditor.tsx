import {
  Control,
  Controller,
  UseFormSetValue,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TableConnection } from '@hyperdx/common-utils/dist/core/metadata';
import {
  AlertThresholdType,
  isRangeThresholdType,
  WebhookService,
} from '@hyperdx/common-utils/dist/types';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Collapse,
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconHelpCircle,
  IconInfoCircleFilled,
  IconTrash,
} from '@tabler/icons-react';

import api from '@/api';
import { AlertNoteField } from '@/components/AlertNoteField';
import { AlertChannelForm } from '@/components/Alerts';
import { AckAlert } from '@/components/alerts/AckAlert';
import { AlertDisplayFields } from '@/components/alerts/AlertDisplayFields';
import { AlertHistoryCardList } from '@/components/alerts/AlertHistoryCards';
import { AlertScheduleFields } from '@/components/AlertScheduleFields';
import { ChartEditorFormState } from '@/components/ChartEditor/types';
import { optionsToSelectData } from '@/utils';
import { webhookSupportsDisplayFields } from '@/utils/alertDisplayFields';
import {
  ALERT_CHANNEL_OPTIONS,
  intervalToMinutes,
  TILE_ALERT_INTERVAL_OPTIONS,
  TILE_ALERT_THRESHOLD_TYPE_OPTIONS,
} from '@/utils/alerts';

export function TileAlertEditor({
  control,
  setValue,
  alert,
  onRemove,
  error,
  warning,
  tooltip,
  tableConnection,
}: {
  control: Control<ChartEditorFormState>;
  setValue: UseFormSetValue<ChartEditorFormState>;
  alert: NonNullable<ChartEditorFormState['alert']>;
  onRemove: () => void;
  error?: string;
  warning?: string;
  tooltip?: string;
  tableConnection?: TableConnection;
}) {
  const { t } = useTranslation('charts');
  const [opened, { toggle }] = useDisclosure(true);

  const alertChannelType = useWatch({ control, name: 'alert.channel.type' });
  const alertWebhookId = useWatch({
    control,
    name: 'alert.channel.webhookId',
  });
  const { data: webhooks } = api.useWebhooks(Object.values(WebhookService));
  // Only the error-oriented Slack service renders display fields, so the input
  // stays hidden rather than offering a setting other channels ignore.
  const showDisplayFields = webhookSupportsDisplayFields(
    webhooks?.data,
    alertWebhookId,
  );
  const alertThresholdType = useWatch({ control, name: 'alert.thresholdType' });
  const alertThreshold = useWatch({ control, name: 'alert.threshold' });
  const alertThresholdMax = useWatch({ control, name: 'alert.thresholdMax' });
  const alertScheduleOffsetMinutes = useWatch({
    control,
    name: 'alert.scheduleOffsetMinutes',
  });
  const alertnumConsecutiveWindows = useWatch({
    control,
    name: 'alert.numConsecutiveWindows',
  });
  const alertNotifyOnStateChangeOnly = useWatch({
    control,
    name: 'alert.notifyOnStateChangeOnly',
  });
  const maxAlertScheduleOffsetMinutes = alert?.interval
    ? Math.max(intervalToMinutes(alert.interval) - 1, 0)
    : 0;
  const alertIntervalLabel = alert?.interval
    ? TILE_ALERT_INTERVAL_OPTIONS[alert.interval]
    : undefined;

  const { data: alertData } = api.useAlert(alert.id);
  const alertItem = alertData?.data;

  return (
    <Paper data-testid="alert-details">
      <Group justify="space-between" px="sm" pt="sm" pb="sm">
        <UnstyledButton onClick={toggle}>
          <Group gap="xs">
            <IconChevronDown
              size={14}
              style={{
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 200ms',
              }}
            />
            <Group gap={4} align="center">
              <Text size="sm" fw={500} mt={2}>
                {t('alertEditor.alert')}
              </Text>
              {tooltip && (
                <Tooltip label={tooltip} withArrow>
                  <IconHelpCircle size={16} opacity={0.5} />
                </Tooltip>
              )}
              {error && (
                <Tooltip label={error} withArrow>
                  <Badge
                    color="var(--color-text-danger)"
                    size="xs"
                    variant="light"
                    ml="xs"
                  >
                    {t('alertEditor.invalidQuery')}
                  </Badge>
                </Tooltip>
              )}
              {warning && (
                <Tooltip label={warning} withArrow>
                  <Badge color="yellow" size="xs" variant="light" ml="xs">
                    {t('alertEditor.warning')}
                  </Badge>
                </Tooltip>
              )}
            </Group>
          </Group>
        </UnstyledButton>
        <Group gap="xs">
          {alertItem && <AlertHistoryCardList alert={alertItem} />}
          {alertItem && <AckAlert alert={alertItem} />}
          <Tooltip label={t('alertEditor.removeAlert')}>
            <ActionIcon
              variant="danger"
              color="red"
              size="sm"
              onClick={onRemove}
              data-testid="remove-alert-button"
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Collapse expanded={opened}>
        <Box px="sm" pb="sm">
          <Group gap="xs">
            <Text size="sm" opacity={0.7}>
              {t('alertEditor.triggerWhenValue')}
            </Text>
            <Controller
              control={control}
              name="alert.thresholdType"
              render={({ field }) => (
                <NativeSelect
                  data={optionsToSelectData(TILE_ALERT_THRESHOLD_TYPE_OPTIONS)}
                  size="xs"
                  {...field}
                  onChange={e => {
                    field.onChange(e);
                    if (
                      isRangeThresholdType(e.currentTarget.value) &&
                      alertThresholdMax == null
                    ) {
                      setValue('alert.thresholdMax', (alertThreshold ?? 0) + 1);
                    }
                  }}
                />
              )}
            />
            <Controller
              control={control}
              name="alert.threshold"
              render={({ field }) => (
                <NumberInput size="xs" w={80} {...field} />
              )}
            />
            {isRangeThresholdType(alertThresholdType as AlertThresholdType) && (
              <>
                <Text size="sm" opacity={0.7}>
                  {t('alertEditor.and')}
                </Text>
                <Controller
                  control={control}
                  name="alert.thresholdMax"
                  render={({ field, fieldState }) => (
                    <NumberInput
                      size="xs"
                      w={80}
                      {...field}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </>
            )}
            {t('alertEditor.over')}
            <Controller
              control={control}
              name="alert.interval"
              render={({ field }) => (
                <NativeSelect
                  data={optionsToSelectData(TILE_ALERT_INTERVAL_OPTIONS)}
                  size="xs"
                  {...field}
                />
              )}
            />
            <Text size="sm" opacity={0.7}>
              {t('alertEditor.via')}
            </Text>
            <Controller
              control={control}
              name="alert.channel.type"
              render={({ field }) => (
                <NativeSelect
                  data={optionsToSelectData(ALERT_CHANNEL_OPTIONS)}
                  size="xs"
                  {...field}
                />
              )}
            />
          </Group>
          {alert?.createdBy && (
            <Text size="xs" opacity={0.6} mt="xs">
              {t('alertEditor.createdBy', {
                name: alert.createdBy.name || alert.createdBy.email,
              })}
            </Text>
          )}
          <AlertScheduleFields
            control={control}
            setValue={setValue}
            scheduleOffsetName="alert.scheduleOffsetMinutes"
            scheduleStartAtName="alert.scheduleStartAt"
            scheduleOffsetMinutes={alertScheduleOffsetMinutes}
            maxScheduleOffsetMinutes={maxAlertScheduleOffsetMinutes}
            offsetWindowLabel={
              alertIntervalLabel
                ? `from each ${alertIntervalLabel} window`
                : 'from each alert window'
            }
            numConsecutiveWindowsName="alert.numConsecutiveWindows"
            numConsecutiveWindows={alertnumConsecutiveWindows ?? undefined}
            notifyOnStateChangeOnlyName="alert.notifyOnStateChangeOnly"
            notifyOnStateChangeOnly={alertNotifyOnStateChangeOnly ?? undefined}
          />
          <Text size="xxs" opacity={0.5} mb={4} mt="sm">
            {t('alertEditor.sendTo')}
          </Text>
          <AlertChannelForm
            control={control}
            type={alertChannelType}
            namePrefix="alert."
          />
          {showDisplayFields && (
            <>
              <Text size="xxs" opacity={0.5} mb={4} mt="sm">
                {t('alertEditor.mention')}
              </Text>
              <Controller
                control={control}
                name="alert.mention"
                render={({ field }) => (
                  <NativeSelect
                    size="xs"
                    data-testid="alert-mention-select"
                    data={[
                      { value: '', label: t('alertEditor.mentionNone') },
                      { value: 'here', label: '@here' },
                      { value: 'channel', label: '@channel' },
                    ]}
                    value={field.value ?? ''}
                    onChange={event =>
                      field.onChange(event.currentTarget.value || undefined)
                    }
                  />
                )}
              />
              <Text size="xxs" opacity={0.5} mt={4}>
                {t('alertEditor.mentionHint')}
              </Text>
              <Text size="xxs" opacity={0.5} mb={4} mt="sm">
                {t('alertEditor.displayFields')}
              </Text>
              <AlertDisplayFields
                control={control}
                name="alert.displayFields"
                tableConnection={tableConnection}
              />
              <Text size="xxs" opacity={0.5} mt={4}>
                {t('alertEditor.displayFieldsHint')}
              </Text>
            </>
          )}
          <AlertNoteField
            control={control}
            name="alert.note"
            labelMarginTop="sm"
          />
          {(alertThresholdType === AlertThresholdType.EQUAL ||
            alertThresholdType === AlertThresholdType.NOT_EQUAL) && (
            <Alert
              icon={<IconInfoCircleFilled size={16} />}
              color="gray"
              py="xs"
              mt="md"
            >
              {t('alertEditor.floatingPointNote')}
            </Alert>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
