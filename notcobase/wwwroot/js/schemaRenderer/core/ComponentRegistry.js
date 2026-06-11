(function (window, antd) {
  window.Notcobase = window.Notcobase || {};

  const {
    Button,
    Checkbox,
    Col,
    Collapse,
    DatePicker,
    Divider,
    Input,
    InputNumber,
    Radio,
    Row,
    Select,
    Space,
    Switch,
    Tabs,
    Typography,
  } = antd;

  const components = new Map();
  const ReferencePicker = window.Notcobase.ReferenceField?.ReferencePicker || function MissingReferencePicker() {
    return null;
  };

  function registerComponent(name, component, options) {
    components.set(name, {
      component,
      name,
      label: options?.label || name,
      category: options?.category || "General",
      field: Boolean(options?.field),
      container: Boolean(options?.container),
      defaultProps: options?.defaultProps || {},
    });
  }

  function getComponent(name) {
    return components.get(name);
  }

  function listComponents() {
    return Array.from(components.values());
  }

  function getComponentItems() {
    const grouped = new Map();

    listComponents().forEach((component) => {
      const category = component.category || "General";

      if (!grouped.has(category)) {
        grouped.set(category, []);
      }

      grouped.get(category).push({
        key: component.name,
        label: component.label || component.name,
      });
    });

    return Array.from(grouped.entries()).map(([category, children]) => ({
      key: `group-${category}`,
      label: category,
      type: "group",
      children,
    }));
  }

  [
    ["Container", "div", { category: "Layout", container: true }],
    ["Button", Button, { category: "Actions" }],
    ["Checkbox", Checkbox, { category: "Fields", field: true }],
    ["DatePicker", DatePicker, { category: "Fields", field: true }],
    ["DetailCard", antd.Card, { label: "Detail Card", category: "Data", container: true, defaultProps: { title: "Record details", bordered: true, tableId: null, recordIdParam: "id", allowEdit: true, allowDelete: true } }],
    ["Divider", Divider, { category: "Layout" }],
    ["FormBlock", antd.Form, { label: "Form Block", category: "Data", container: true, defaultProps: { title: "Form block", layout: "vertical", tableId: null, recordIdParam: "id", mode: "auto", allowCreate: true, allowDelete: false, submitLabel: "Save", formColumns: [] } }],
    ["Grid.Col", Col, { label: "Column", category: "Layout", container: true }],
    ["Grid.Row", Row, { label: "Row", category: "Layout", container: true, defaultProps: { gutter: 16 } }],
    ["Input", Input, { category: "Fields", field: true }],
    ["Input.TextArea", Input.TextArea, { label: "Text Area", category: "Fields", field: true }],
    ["InputNumber", InputNumber, { label: "Number", category: "Fields", field: true }],
    ["Radio.Group", Radio.Group, { label: "Radio Group", category: "Fields", field: true }],
    ["Reference", ReferencePicker, { label: "Reference", category: "Fields", field: true }],
    ["Select", Select, { category: "Fields", field: true }],
    ["Space", Space, { category: "Layout", container: true }],
    ["Switch", Switch, { category: "Fields", field: true }],
    ["TableBlock", antd.Table, { label: "Table Block", category: "Data", defaultProps: { title: "Records", tableId: null, allowCreate: true, allowEdit: true, allowDelete: true, pageSize: 10, columns: [] } }],
    ["Tabs", Tabs, { category: "Layout", container: true }],
    ["Text", Typography.Text, { category: "Typography" }],
    ["Title", Typography.Title, { category: "Typography" }],
    ['Section', Collapse, { label: 'Accordion Section', category: 'Layout', container: true, defaultProps: { title: 'Section', accordion: true, collapsible: true, defaultCollapsed: false, bordered: false }
    }]
  ].forEach(([name, component, options]) => registerComponent(name, component, options));

  window.Notcobase.ComponentRegistry = {
    getComponent,
    listComponents,
    getComponentItems,
    registerComponent,
  };
})(window, antd);
