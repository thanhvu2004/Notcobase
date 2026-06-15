(function (window, React, antd) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { useEffect, useState } = React;
  const { Alert, Button, Card, Checkbox, Divider, Form, Input, InputNumber, Select, Space, Spin, Tag, Typography } = antd;
  const { BlockUtils, ComponentRegistry, SchemaUtils, TablesApi, useDesignerStore } = window.Notcobase;

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

  function componentLabelForFieldType(fieldType) {
    return BlockUtils.fieldTypeToSchemaComponent(fieldType).component;
  }

  function FormBlockColumnPicker({ node, tableId, onColumnsChange }) {
    const [tableDetails, setTableDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
      if (!tableId) {
        setTableDetails(null);
        setError("");
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError("");

      TablesApi.get(tableId)
        .then((details) => {
          if (!cancelled) {
            setTableDetails(details);
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError.message);
            setTableDetails(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [tableId]);

    if (!tableId) {
      return h(
        Typography.Text,
        { type: "secondary", className: "schema-form-column-hint" },
        "Select a table above, then choose which columns appear in the form.",
      );
    }

    if (loading) {
      return h("div", { className: "schema-form-column-loading" }, h(Spin, { size: "small" }), h(Typography.Text, null, " Loading columns…"));
    }

    if (error) {
      return h(Alert, { type: "error", showIcon: true, message: error });
    }

    const columns = tableDetails?.columns || [];
    if (!columns.length) {
      return h(Alert, {
        type: "warning",
        showIcon: true,
        message: "This table has no columns yet. Add columns in Tables admin first.",
      });
    }

    const selected = BlockUtils.getFormBlockSelectedColumns(node);

    function handleToggle(columnName, checked) {
      const nextSelected = checked
        ? [...selected.filter((name) => name.toLowerCase() !== columnName.toLowerCase()), columnName]
        : selected.filter((name) => name.toLowerCase() !== columnName.toLowerCase());

      onColumnsChange(nextSelected, columns);
    }

    function handleSelectAll() {
      onColumnsChange(columns.map((column) => column.name), columns);
    }

    function handleClearAll() {
      onColumnsChange([], columns);
    }

    return h(
      "div",
      { className: "schema-form-column-picker" },
      h(
        Space,
        { className: "schema-form-column-actions", wrap: true },
        h(Button, { size: "small", onClick: handleSelectAll }, "Select all"),
        h(Button, { size: "small", onClick: handleClearAll }, "Clear"),
      ),
      h(
        "div",
        { className: "schema-form-column-list" },
        columns.map((column) => {
          const checked = selected.some((name) => name.toLowerCase() === column.name.toLowerCase());
          return h(
            "label",
            { key: column.name, className: "schema-form-column-item" },
            h(Checkbox, {
              checked,
              onChange: (event) => handleToggle(column.name, event.target.checked),
            }),
            h("span", { className: "schema-form-column-name" }, column.name),
            h(Tag, null, column.fieldType || "text"),
            h(Tag, { color: "blue" }, componentLabelForFieldType(column.fieldType)),
            column.isRequired && h(Tag, { color: "red" }, "required"),
          );
        }),
      ),
    );
  }

  function BlockConfigFields({
    node,
    componentName,
    tables,
    updateBlockProp,
    onFormBlockTableChange,
    onFormBlockColumnsChange,
  }) {
    const config = node["x-component-props"] || {};
    const tableOptions = (tables || []).map((table) => ({
      label: table.name,
      value: table.id,
    }));

    if (!SchemaUtils.isBlockComponent(componentName)) {
      return null;
    }

    function handleTableChange(value) {
      if (componentName === "FormBlock") {
        onFormBlockTableChange(value ?? null);
        return;
      }

      updateBlockProp("tableId", value ?? null);
    }

    return h(
      React.Fragment,
      null,
      h(Divider, { orientation: "left", plain: true }, "Block data source"),
      h(
        Form.Item,
        { label: "Table" },
        h(Select, {
          allowClear: true,
          placeholder: "Select table",
          value: config.tableId ?? undefined,
          options: tableOptions,
          onChange: handleTableChange,
        }),
      ),
      componentName === "FormBlock" &&
        h(
          React.Fragment,
          null,
          h(Divider, { orientation: "left", plain: true }, "Form fields from columns"),
          h(FormBlockColumnPicker, {
            node,
            tableId: config.tableId,
            onColumnsChange: onFormBlockColumnsChange,
          }),
        ),
      (componentName === "DetailCard" || componentName === "FormBlock") &&
        h(
          Form.Item,
          { label: "Record ID" },
          h(InputNumber, {
            style: { width: "100%" },
            value: config.recordId ?? undefined,
            placeholder: "Optional fixed record ID",
            onChange: (value) => updateBlockProp("recordId", value ?? null),
          }),
        ),
      (componentName === "DetailCard" || componentName === "FormBlock") &&
        h(
          Form.Item,
          { label: "Record ID URL param" },
          h(Input, {
            value: config.recordIdParam || "id",
            onChange: (event) => updateBlockProp("recordIdParam", event.target.value),
          }),
        ),
      componentName === "FormBlock" &&
        h(
          Form.Item,
          { label: "Mode" },
          h(Select, {
            value: config.mode || "auto",
            options: [
              { label: "Auto", value: "auto" },
              { label: "Create", value: "create" },
              { label: "Edit", value: "edit" },
            ],
            onChange: (value) => updateBlockProp("mode", value),
          }),
        ),
      componentName === "FormBlock" &&
        h(
          Form.Item,
          null,
          h(Checkbox, {
            checked: Boolean(config.useFormGroup),
            onChange: (event) => updateBlockProp("useFormGroup", event.target.checked),
          }, "Use shared form group"),
        ),
      componentName === "FormBlock" &&
        h(
          Form.Item,
          { label: "Form group key" },
          h(Input, {
            value: config.formGroupKey || "",
            placeholder: config.tableId ? `table:${config.tableId}` : "customer-profile",
            disabled: !config.useFormGroup,
            onChange: (event) => updateBlockProp("formGroupKey", event.target.value),
          }),
        ),
      componentName === "FormBlock" &&
        h(
          Form.Item,
          null,
          h(Checkbox, {
            checked: config.showGroupSubmit !== false,
            disabled: !config.useFormGroup,
            onChange: (event) => updateBlockProp("showGroupSubmit", event.target.checked),
          }, "Show group save button"),
        ),
      componentName === "FormBlock" &&
        h(
          Form.Item,
          { label: "Submit label" },
          h(Input, {
            value: config.submitLabel || "Save",
            onChange: (event) => updateBlockProp("submitLabel", event.target.value),
          }),
        ),
      componentName === "TableBlock" &&
        h(
          Form.Item,
          { label: "Page size" },
          h(InputNumber, {
            style: { width: "100%" },
            min: 1,
            value: config.pageSize || 10,
            onChange: (value) => updateBlockProp("pageSize", value || 10),
          }),
        ),
      h(Divider, { orientation: "left", plain: true }, "CRUD permissions"),
      componentName !== "DetailCard" &&
        h(
          Form.Item,
          null,
          h(Checkbox, {
            checked: config.allowCreate !== false,
            onChange: (event) => updateBlockProp("allowCreate", event.target.checked),
          }, "Allow create"),
        ),
      h(
        Form.Item,
        null,
        h(Checkbox, {
          checked: config.allowEdit !== false,
          onChange: (event) => updateBlockProp("allowEdit", event.target.checked),
        }, "Allow edit"),
      ),
      h(
        Form.Item,
        null,
        h(Checkbox, {
          checked: Boolean(config.allowDelete),
          onChange: (event) => updateBlockProp("allowDelete", event.target.checked),
        }, "Allow delete"),
      ),
    );
  }

  function PropertyPanel({ schema, tables, onSchemaChange, onAddComponent }) {
    const selectedNodeId = useDesignerStore((state) => state.selectedNodeId);
    const selectedMatch = SchemaUtils.findNode(schema, selectedNodeId);
    const [propsError, setPropsError] = useState("");
    const [propsText, setPropsText] = useState("{}");

    useEffect(() => {
      if (selectedMatch?.node) {
        setPropsText(JSON.stringify(selectedMatch.node["x-component-props"] || {}, null, 2));
        setPropsError("");
      }
    }, [selectedNodeId]);

    if (!selectedMatch) {
      return h(
        Card,
        { title: "Properties", size: "small", className: "schema-property-panel" },
        h(Alert, {
          type: "info",
          showIcon: true,
          message: "Select a component to edit its metadata.",
        }),
      );
    }

    const node = selectedMatch.node;
    const componentName = SchemaUtils.inferComponent(node);
    const isBlock = SchemaUtils.isBlockComponent(componentName);
    const isFormBlock = componentName === "FormBlock";
    const isGridRow = componentName === "Grid.Row";
    const isRequired = Boolean(selectedMatch.parent && Array.isArray(selectedMatch.parent.required) && selectedMatch.parent.required.includes(selectedMatch.key));
    const componentOptions = ComponentRegistry.listComponents().map((item) => ({
      label: item.label,
      value: item.name,
    }));

    function updateSelectedNode(updater) {
      onSchemaChange(SchemaUtils.updateNode(schema, selectedNodeId, updater));
    }

    function updateBlockProp(key, value) {
      updateSelectedNode((draft) => {
        if (key === "__field__") {
          if (value) {
            draft["x-field"] = value;
          } else {
            delete draft["x-field"];
          }
          return draft;
        }

        draft["x-component-props"] = draft["x-component-props"] || {};
        draft["x-component-props"][key] = value;
        setPropsText(JSON.stringify(draft["x-component-props"], null, 2));
        return draft;
      });
    }

    function replaceSelectedNode(nextNode) {
      setPropsText(JSON.stringify(nextNode["x-component-props"] || {}, null, 2));
      onSchemaChange(SchemaUtils.updateNode(schema, selectedNodeId, () => nextNode));
    }

    async function handleFormBlockTableChange(tableId) {
      if (!tableId) {
        replaceSelectedNode(BlockUtils.applyFormBlockTableChange(node, [], null));
        return;
      }

      try {
        const tableDetails = await TablesApi.get(tableId);
        replaceSelectedNode(BlockUtils.applyFormBlockTableChange(node, tableDetails.columns || [], tableId));
      } catch (loadError) {
        updateBlockProp("tableId", tableId);
      }
    }

    function handleFormBlockColumnsChange(selectedColumnNames, tableColumns) {
      replaceSelectedNode(BlockUtils.applyFormBlockColumnSelection(node, tableColumns, selectedColumnNames));
    }

    const insertComponents = isFormBlock
      ? ["Button"]
      : ["Input", "Select", "DetailCard", "FormBlock", "TableBlock", "Grid.Row", "Grid.Col", "Space", "Divider", "Tabs", "Section", "Button"];

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
              if (SchemaUtils.isBlockComponent(value)) {
                const defaults = ComponentRegistry.getComponent(value)?.defaultProps || {};
                draft["x-component-props"] = {
                  ...defaults,
                  ...(draft["x-component-props"] || {}),
                };
                if (value === "FormBlock") {
                  draft.properties = {};
                }
              }
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
              draft["x-component-props"] = draft["x-component-props"] || {};
              draft["x-component-props"].title = event.target.value;
              setPropsText(JSON.stringify(draft["x-component-props"], null, 2));
              return draft;
            }),
          }),
        ),
        !isBlock &&
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
        !isBlock &&
          selectedMatch.parent &&
          SchemaUtils.isFormLikeBlock(selectedMatch.parent) &&
          h(
            Form.Item,
            { label: "Field column (x-field)" },
            h(Input, {
              value: node["x-field"] || "",
              placeholder: "Table column name",
              onChange: (event) => updateSelectedNode((draft) => {
                if (event.target.value) {
                  draft["x-field"] = event.target.value;
                } else {
                  delete draft["x-field"];
                }
                return draft;
              }),
            }),
          ),
        !isBlock &&
          h(Divider, { orientation: "left", plain: true }, "Visibility"),
        !isBlock &&
          h(
            Form.Item,
            { label: "Visible when field" },
            h(Input, {
              value: node?.["x-component-props"]?.visibleWhen?.field || "",
              placeholder: "Field name",
              onChange: (event) => updateSelectedNode((draft) => {
                draft["x-component-props"] = draft["x-component-props"] || {};
                draft["x-component-props"].visibleWhen = {
                  ...(draft["x-component-props"].visibleWhen || {}),
                  field: event.target.value,
                };
                return draft;
              }),
            }),
          ),
        !isBlock &&
          h(
            Form.Item,
            { label: "Operator" },
            h(Select, {
              value: node?.["x-component-props"]?.visibleWhen?.operator || "=",
              options: [
                { label: "Equals", value: "=" },
                { label: "Not Equals", value: "!=" },
                { label: "Contains", value: "contains" },
              ],
              onChange: (value) => updateSelectedNode((draft) => {
                draft["x-component-props"] = draft["x-component-props"] || {};
                draft["x-component-props"].visibleWhen = {
                  ...(draft["x-component-props"].visibleWhen || {}),
                  operator: value,
                };
                return draft;
              }),
            }),
          ),
        !isBlock &&
          h(
            Form.Item,
            { label: "Value" },
            h(Input, {
              value: node?.["x-component-props"]?.visibleWhen?.value || "",
              placeholder: "Match value",
              onChange: (event) => updateSelectedNode((draft) => {
                draft["x-component-props"] = draft["x-component-props"] || {};
                draft["x-component-props"].visibleWhen = {
                  ...(draft["x-component-props"].visibleWhen || {}),
                  value: event.target.value,
                };
                return draft;
              }),
            }),
          ),
        !isBlock &&
          h(
            Form.Item,
            null,
            h(Checkbox, {
              checked: isRequired,
              disabled: !selectedMatch.parent,
              onChange: (event) => onSchemaChange(SchemaUtils.setRequired(schema, selectedNodeId, event.target.checked)),
            }, "Required field"),
          ),
        isGridRow &&
          h(
            Form.Item,
            { label: "Columns" },
            h(InputNumber, {
              min: 1,
              max: 12,
              style: { width: "100%" },
              value: node["x-component-props"]?.columns || Object.keys(node.properties || {}).length || 2,
              onChange: (value) => {
                const columnCount = Math.max(1, Math.min(12, Number(value || 1)));

                updateSelectedNode((draft) => {
                  draft.properties = draft.properties || {};
                  draft["x-component-props"] = draft["x-component-props"] || {};
                  draft["x-component-props"].columns = columnCount;

                  const currentKeys = Object.keys(draft.properties);

                  if (currentKeys.length < columnCount) {
                    for (let i = currentKeys.length; i < columnCount; i += 1) {
                      draft.properties[`col${i + 1}`] = {
                        id: SchemaUtils.createNodeId(`col${i + 1}`),
                        type: "void",
                        title: `Column ${i + 1}`,
                        "x-component": "Grid.Col",
                        "x-component-props": {
                          span: Math.floor(24 / columnCount),
                        },
                        properties: {},
                        "x-index": i,
                      };
                    }
                  } else if (currentKeys.length > columnCount) {
                    currentKeys
                      .sort((a, b) => (draft.properties[a]["x-index"] ?? 0) - (draft.properties[b]["x-index"] ?? 0))
                      .slice(columnCount)
                      .forEach((key) => delete draft.properties[key]);
                  }

                  const span = Math.floor(24 / columnCount);
                  Object.values(draft.properties).forEach((col) => {
                    col["x-component-props"] = col["x-component-props"] || {};
                    col["x-component-props"].span = span;
                  });

                  return draft;
                });
              },
            })
          ),
        h(BlockConfigFields, {
          node,
          componentName,
          tables,
          updateBlockProp,
          onFormBlockTableChange: handleFormBlockTableChange,
          onFormBlockColumnsChange: handleFormBlockColumnsChange,
        }),
        h(
          Form.Item,
          { label: isBlock ? "Block props (JSON)" : "Component props" },
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
          h(Typography.Text, { strong: true }, isFormBlock ? "Add action" : "Insert component"),
          isFormBlock &&
            h(Typography.Text, { type: "secondary", className: "schema-form-column-hint" }, "Form fields are managed from table columns above."),
          h(
            Space,
            { wrap: true },
            insertComponents.map((component) =>
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
