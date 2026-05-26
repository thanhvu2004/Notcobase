(function (window, React, antd) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { Alert, Button, Card, Checkbox, Form, Input, Select, Space, Typography } = antd;
  const { ComponentRegistry, SchemaUtils, useDesignerStore } = window.Notcobase;

  function parseJsonObject(value) {
    if (!value || !value.trim()) {
      return {};
    }

    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Component props must be a JSON object.");
    }

    return parsed;
  }

  function PropertyPanel({ schema, onSchemaChange, onAddComponent }) {
    const selectedNodeId = useDesignerStore((state) => state.selectedNodeId);
    const selectedMatch = SchemaUtils.findNode(schema, selectedNodeId);
    const [propsError, setPropsError] = React.useState("");
    const [propsText, setPropsText] = React.useState("{}");

    React.useEffect(() => {
      if (selectedMatch?.node) {
        setPropsText(JSON.stringify(selectedMatch.node["x-component-props"] || {}, null, 2));
        setPropsError("");
      }
    }, [selectedNodeId]);

    if (!selectedMatch) {
      return h(
        Card,
        { title: "Properties", size: "small" },
        h(Alert, {
          type: "info",
          showIcon: true,
          message: "Select a component to edit its metadata.",
        }),
      );
    }

    const node = selectedMatch.node;
    const componentName = SchemaUtils.inferComponent(node);
    const isRequired = Boolean(selectedMatch.parent && Array.isArray(selectedMatch.parent.required) && selectedMatch.parent.required.includes(selectedMatch.key));
    const componentOptions = ComponentRegistry.listComponents().map((item) => ({
      label: item.label,
      value: item.name,
    }));

    function updateSelectedNode(updater) {
      onSchemaChange(SchemaUtils.updateNode(schema, selectedNodeId, updater));
    }

    return h(
      Card,
      { title: "Properties", size: "small" },
      h(
        Form,
        { layout: "vertical" },
        h(Form.Item, { label: "Node ID" }, h(Input, { value: node.id, readOnly: true })),
        h(
          Form.Item,
          { label: "Component type" },
          h(Select, {
            value: componentName,
            options: componentOptions,
            showSearch: true,
            onChange: (value) => updateSelectedNode((draft) => {
              draft["x-component"] = value;
              return draft;
            }),
          }),
        ),
        h(
          Form.Item,
          { label: "Title" },
          h(Input, {
            value: node.title || "",
            onChange: (event) => updateSelectedNode((draft) => {
              draft.title = event.target.value;
              return draft;
            }),
          }),
        ),
        h(
          Form.Item,
          { label: "Placeholder" },
          h(Input, {
            value: node.placeholder || node["x-component-props"]?.placeholder || "",
            onChange: (event) => updateSelectedNode((draft) => {
              draft["x-component-props"] = draft["x-component-props"] || {};
              draft["x-component-props"].placeholder = event.target.value;
              draft.placeholder = event.target.value;
              return draft;
            }),
          }),
        ),
        h(
          Form.Item,
          null,
          h(Checkbox, {
            checked: isRequired,
            disabled: !selectedMatch.parent,
            onChange: (event) => onSchemaChange(SchemaUtils.setRequired(schema, selectedNodeId, event.target.checked)),
          }, "Required field"),
        ),
        h(
          Form.Item,
          { label: "Component props" },
          h(Input.TextArea, {
            rows: 8,
            value: propsText,
            spellCheck: false,
            onChange: (event) => {
              setPropsText(event.target.value);

              try {
                const props = parseJsonObject(event.target.value);
                setPropsError("");
                updateSelectedNode((draft) => {
                  draft["x-component-props"] = props;
                  return draft;
                });
              } catch (error) {
                setPropsError(error.message);
              }
            },
          }),
          propsError && h(Typography.Text, { type: "danger" }, propsError),
        ),
        h(
          Space,
          { direction: "vertical", className: "schema-property-actions" },
          h(Typography.Text, { strong: true }, "Insert component"),
          h(
            Space,
            { wrap: true },
            ["Input", "Select", "Card", "Grid.Row", "Grid.Col", "Space", "Tabs", "Button"].map((component) =>
              h(Button, {
                key: component,
                size: "small",
                onClick: () => onAddComponent(component, selectedNodeId),
              }, component),
            ),
          ),
        ),
      ),
    );
  }

  window.Notcobase.PropertyPanel = PropertyPanel;
})(window, React, antd);
