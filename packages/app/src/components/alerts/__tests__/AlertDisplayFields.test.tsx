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

type Form = {
  displayFields?: { valueExpression: string; alias?: string }[];
};

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

const rowEditors = () =>
  screen
    .queryAllByTestId('sql-inline-editor')
    .map(el => el.getAttribute('data-name'));

beforeEach(() => {
  delete captured.value;
});

describe('AlertDisplayFields', () => {
  it('starts with no rows so nothing is queried by default', () => {
    renderFields();

    expect(rowEditors()).toEqual([]);
  });

  it('renders one expression editor per configured field', () => {
    renderFields({
      displayFields: [
        { valueExpression: 'StatusMessage' },
        { valueExpression: "SpanAttributes['code.stacktrace']" },
      ],
    });

    expect(rowEditors()).toEqual([
      'displayFields.0.valueExpression',
      'displayFields.1.valueExpression',
    ]);
  });

  it('gives each row its own label input', () => {
    renderFields({ displayFields: [{ valueExpression: 'StatusMessage' }] });

    expect(screen.getByTestId('display-field-alias-0')).toBeInTheDocument();
  });

  it('adds a row on demand', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(screen.getByTestId('add-display-field'));

    expect(rowEditors()).toEqual(['displayFields.0.valueExpression']);
  });

  it('removes the row the button belongs to, not another one', async () => {
    const user = userEvent.setup();
    renderFields({
      displayFields: [
        { valueExpression: 'a' },
        { valueExpression: 'b' },
        { valueExpression: 'c' },
      ],
    });

    await user.click(screen.getByTestId('remove-display-field-1'));
    await user.click(screen.getByText('save'));

    // useFieldArray re-indexes the remaining rows, so the surviving values —
    // not the field paths — are what proves the right row went.
    expect(captured.value?.displayFields).toEqual([
      { valueExpression: 'a' },
      { valueExpression: 'c' },
    ]);
  });

  it('submits the rows as an array, preserving order', async () => {
    const user = userEvent.setup();
    renderFields({
      displayFields: [
        { valueExpression: 'StatusMessage', alias: '오류 내용' },
        { valueExpression: "SpanAttributes['code.stacktrace']" },
      ],
    });

    await user.click(screen.getByText('save'));

    expect(captured.value?.displayFields).toEqual([
      { valueExpression: 'StatusMessage', alias: '오류 내용' },
      { valueExpression: "SpanAttributes['code.stacktrace']" },
    ]);
  });
});
