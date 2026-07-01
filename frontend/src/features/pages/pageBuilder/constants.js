export const componentTypes = ['Container', 'Section', 'Grid.Row', 'Grid.Col', 'Tabs', 'Divider', 'Heading', 'Text', 'Button', 'Input', 'InputNumber', 'Input.TextArea', 'Textarea', 'Select', 'Checkbox', 'Switch', 'DatePicker', 'File', 'Reference', 'FormBlock', 'TableBlock']
export const fieldComponents = ['Input', 'InputNumber', 'Input.TextArea', 'Textarea', 'Select', 'Checkbox', 'Switch', 'DatePicker', 'File', 'Reference']
export const blockComponents = ['FormBlock', 'TableBlock']

export const defaultSchema = {
  type: 'object',
  name: 'NewPage',
  title: 'New Page',
  'x-component': 'Container',
  'x-component-props': { layout: 'vertical' },
  properties: {},
}
