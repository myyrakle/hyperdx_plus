import {
  ArrayPath,
  Control,
  FieldArray,
  FieldValues,
  Path,
  useFieldArray,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TableConnection } from '@hyperdx/common-utils/dist/core/metadata';
import { ActionIcon, Button, Flex, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import { InputControlled } from '@/components/InputControlled';
import { SQLInlineEditorControlled } from '@/components/SQLEditor/SQLInlineEditor';

/**
 * What an alert pulls from a representative row of the group that fired.
 *
 * The named slots exist because the notification's layout is fixed: the error
 * message reads as a short field and the stack trace always gets a full-width
 * code block. Asking for them by role means the rendering is predictable and the
 * form can say what each value is for, instead of accepting a list of
 * expressions whose purpose only the author knows.
 *
 * Extras cover everything else — `db.query.text`, a request id — and are labelled
 * by the user, or by their expression when left blank.
 */
export const AlertDisplayFields = <T extends FieldValues>({
  control,
  name,
  tableConnection,
}: {
  control: Control<T>;
  /** Path to the display-fields object, e.g. `displayFields` or `alert.displayFields`. */
  name: string;
  tableConnection?: TableConnection;
}) => {
  const { t } = useTranslation('alerts');
  const { fields, append, remove } = useFieldArray<T>({
    control,
    name: `${name}.extra` as ArrayPath<T>,
  });

  return (
    <>
      {(
        [
          ['errorMessage', t('displayFields.errorMessage')],
          ['stacktrace', t('displayFields.stacktrace')],
        ] as const
      ).map(([slot, label]) => (
        <Flex key={slot} align="center" gap="xs" mb={4}>
          <Text size="xxs" opacity={0.5} style={{ minWidth: 90 }}>
            {label}
          </Text>
          <SQLInlineEditorControlled
            tableConnection={tableConnection}
            control={control}
            name={`${name}.${slot}` as Path<T>}
            placeholder={t(`displayFields.${slot}Placeholder`)}
            disableKeywordAutocomplete
            size="xs"
          />
        </Flex>
      ))}

      <Text size="xxs" opacity={0.5} mt="xs" mb={4}>
        {t('displayFields.extra')}
      </Text>
      {fields.map((field, index) => (
        <Flex key={field.id} align="center" gap="xs" mb={4}>
          <SQLInlineEditorControlled
            tableConnection={tableConnection}
            control={control}
            name={`${name}.extra.${index}.valueExpression` as Path<T>}
            placeholder={t('displayFields.extraPlaceholder')}
            disableKeywordAutocomplete
            size="xs"
          />
          <Text size="xxs" c="gray">
            {t('displayFields.as')}
          </Text>
          <InputControlled
            control={control}
            name={`${name}.extra.${index}.alias` as Path<T>}
            data-testid={`display-field-alias-${index}`}
            placeholder={t('displayFields.aliasPlaceholder')}
            size="xs"
          />
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            data-testid={`remove-display-field-${index}`}
            aria-label={t('displayFields.remove')}
            onClick={() => remove(index)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Flex>
      ))}
      <Button
        variant="subtle"
        color="gray"
        size="compact-xs"
        leftSection={<IconPlus size={14} />}
        data-testid="add-display-field"
        onClick={() =>
          append({ valueExpression: '' } as FieldArray<T, ArrayPath<T>>)
        }
      >
        {t('displayFields.add')}
      </Button>
    </>
  );
};
