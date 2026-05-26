(function (window, antd) {
  window.Notcobase = window.Notcobase || {};

  const {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    DatePicker,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    Radio,
    Row,
    Select,
    Space,
    Switch,
    Table,
    Tabs,
    Typography,
  } = antd;

  const components = new Map();

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

  [
    ["Action", Button, { label: "Action", category: "Actions" }],
    ["Alert", Alert, { category: "Feedback" }],
    ["Button", Button, { category: "Actions" }],
    ["Card", Card, { category: "Layout", container: true }],
    ["Checkbox", Checkbox, { category: "Fields", field: true }],
    ["DatePicker", DatePicker, { category: "Fields", field: true }],
    ["Divider", Divider, { category: "Layout" }],
    ["Empty", Empty, { category: "Feedback" }],
    ["Form", Form, { category: "Layout", container: true }],
    ["Grid.Col", Col, { label: "Column", category: "Layout", container: true }],
    ["Grid.Row", Row, { label: "Row", category: "Layout", container: true, defaultProps: { gutter: 16 } }],
    ["Input", Input, { category: "Fields", field: true }],
    ["Input.TextArea", Input.TextArea, { label: "Text Area", category: "Fields", field: true }],
    ["InputNumber", InputNumber, { label: "Number", category: "Fields", field: true }],
    ["Radio.Group", Radio.Group, { label: "Radio Group", category: "Fields", field: true }],
    ["Select", Select, { category: "Fields", field: true }],
    ["Space", Space, { category: "Layout", container: true }],
    ["Switch", Switch, { category: "Fields", field: true }],
    ["Table", Table, { category: "Data" }],
    ["Tabs", Tabs, { category: "Layout", container: true }],
    ["Text", Typography.Text, { category: "Typography" }],
    ["Title", Typography.Title, { category: "Typography" }],
  ].forEach(([name, component, options]) => registerComponent(name, component, options));

  window.Notcobase.ComponentRegistry = {
    getComponent,
    listComponents,
    registerComponent,
  };
})(window, antd);
