import { useForm } from 'react-hook-form';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AlertDisplayFields } from '@/components/alerts/AlertDisplayFields';

jest.mock('@/components/SQLEditor/SQLInlineEditor', () => ({
  __esModule: true,
  SQLInlineEditorControlled: ({ name }: { name: string }) => (
    <div data-testid="sql-inline-editor" data-name={name} />
  ),
}));

type Fields = {
  errorMessage?: string;
  stacktrace?: string;
  extra?: { valueExpression: string; alias?: string }[];
};

type Form = { displayFields?: Fields };

const captured: { value?: Form } = {};

const Harness = ({ defaultValues }: { defaultValues?: Form }) => {
  const { control, handleSubmit } = useForm<Form>({
    defaultValues: defaultValues ?? {},
  });
  return (
    <form
      onSubmit={handleSubmit(values => {
        Object.assign(captured, { value: values });
      })}
    >
      <AlertDisplayFields control={control} name="displayFields" />
      <button type="submit">save</button>
    </form>
  );
};

const renderFields = (defaultValues?: Form) =>
  render(
    <MantineProvider>
      <Harness defaultValues={defaultValues} />
    </MantineProvider>,
  );

const editorNames = () =>
  screen
    .queryAllByTestId('sql-inline-editor')
    .map(el => el.getAttribute('data-name'));

beforeEach(() => {
  delete captured.value;
});

describe('AlertDisplayFields', () => {
  describe('named slots', () => {
    it('always offers the error message and stack trace slots', () => {
      renderFields();

      expect(editorNames()).toEqual([
        'displayFields.errorMessage',
        'displayFields.stacktrace',
      ]);
    });

    it('labels each slot by its role, not by the expression', () => {
      renderFields();

      expect(screen.getByText('error message')).toBeInTheDocument();
      expect(screen.getByText('stack trace')).toBeInTheDocument();
    });

    it('submits the slots as named values', async () => {
      const user = userEvent.setup();
      renderFields({
        displayFields: {
          errorMessage: 'StatusMessage',
          stacktrace: "SpanAttributes['code.stacktrace']",
        },
      });

      await user.click(screen.getByText('save'));

      expect(captured.value?.displayFields).toMatchObject({
        errorMessage: 'StatusMessage',
        stacktrace: "SpanAttributes['code.stacktrace']",
      });
    });
  });

  describe('extra fields', () => {
    it('starts with none', () => {
      renderFields();

      expect(
        screen.queryByTestId('display-field-alias-0'),
      ).not.toBeInTheDocument();
    });

    it('adds a row with its own expression and label inputs', async () => {
      const user = userEvent.setup();
      renderFields();

      await user.click(screen.getByTestId('add-display-field'));

      expect(editorNames()).toContain('displayFields.extra.0.valueExpression');
      expect(screen.getByTestId('display-field-alias-0')).toBeInTheDocument();
    });

    it('removes the row the button belongs to, not another one', async () => {
      const user = userEvent.setup();
      renderFields({
        displayFields: {
          extra: [
            { valueExpression: 'a' },
            { valueExpression: 'b' },
            { valueExpression: 'c' },
          ],
        },
      });

      await user.click(screen.getByTestId('remove-display-field-1'));
      await user.click(screen.getByText('save'));

      // useFieldArray re-indexes the remaining rows, so the surviving values —
      // not the field paths — are what proves the right row went.
      expect(captured.value?.displayFields?.extra).toEqual([
        { valueExpression: 'a' },
        { valueExpression: 'c' },
      ]);
    });

    it('keeps extras separate from the named slots', async () => {
      const user = userEvent.setup();
      renderFields({
        displayFields: {
          errorMessage: 'StatusMessage',
          extra: [{ valueExpression: 'db.query.text', alias: 'Query' }],
        },
      });

      await user.click(screen.getByText('save'));

      expect(captured.value?.displayFields).toEqual({
        errorMessage: 'StatusMessage',
        extra: [{ valueExpression: 'db.query.text', alias: 'Query' }],
      });
    });
  });
});
