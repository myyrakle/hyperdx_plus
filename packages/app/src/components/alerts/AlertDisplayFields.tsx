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
 * Repeatable expression/label rows for an alert's display fields.
 *
 * One row per value so each expression is editable on its own, rather than
 * hidden inside one comma-separated string. The label is optional: left blank,
 * the notification derives one from the expression.
 */
export const AlertDisplayFields = <T extends FieldValues>({
  control,
  name,
  tableConnection,
}: {
  control: Control<T>;
  name: ArrayPath<T>;
  tableConnection?: TableConnection;
}) => {
  const { t } = useTranslation('alerts');
  const { fields, append, remove } = useFieldArray<T>({ control, name });

  return (
    <>
      {fields.map((field, index) => (
        <Flex key={field.id} align="center" gap="xs" mb={4}>
          <SQLInlineEditorControlled
            tableConnection={tableConnection}
            control={control}
            name={`${name}.${index}.valueExpression` as Path<T>}
            placeholder={t('displayFields.expressionPlaceholder')}
            disableKeywordAutocomplete
            size="xs"
          />
          <Text size="xxs" c="gray">
            {t('displayFields.as')}
          </Text>
          <InputControlled
            control={control}
            name={`${name}.${index}.alias` as Path<T>}
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
