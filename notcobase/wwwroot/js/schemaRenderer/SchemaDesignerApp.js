(function (window, React, ReactDOM, antd) {
  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;
  const { App, Button, Card, ConfigProvider, Input, Select, Space, Spin, Typography, message, theme } = antd;
  const {
    DesignerStore,
    PropertyPanel,
    SchemaPagesApi,
    SchemaRenderer,
    SchemaUtils,
  } = window.Notcobase;

  const defaultSchema = SchemaUtils.ensureNodeIds({
    type: "object",
    name: "customerForm",
    title: "Customer form",
    "x-component": "Form",
    "x-component-props": {
      layout: "vertical",
    },
    required: ["name"],
    properties: {
      name: {
        type: "string",
        title: "Customer name",
        "x-component": "Input",
        "x-index": 0,
      },
      status: {
        type: "string",
        title: "Status",
        "x-component": "Select",
        enum: [
          { label: "Lead", value: "lead" },
          { label: "Active", value: "active" },
        ],
        "x-index": 1,
      },
      actions: {
        type: "void",
        "x-component": "Space",
        "x-index": 2,
        properties: {
          submit: {
            type: "void",
            title: "Submit",
            "x-component": "Button",
            "x-component-props": {
              type: "primary",
              htmlType: "submit",
            },
            "x-index": 0,
          },
        },
      },
    },
  });

  function parseSchemaJson(value) {
    const parsed = JSON.parse(value);
    return SchemaUtils.ensureNodeIds(parsed);
  }

  function SchemaDesignerApp() {
    const [pages, setPages] = useState([]);
    const [activePageId, setActivePageId] = useState(null);
    const [pageName, setPageName] = useState("Customer form");
    const [schema, setSchema] = useState(defaultSchema);
    const [schemaText, setSchemaText] = useState(JSON.stringify(defaultSchema, null, 2));
    const [mode, setMode] = useState("designer");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schemaError, setSchemaError] = useState("");
    const [submittedValues, setSubmittedValues] = useState(null);

    useEffect(() => {
      loadPages();
    }, []);

    useEffect(() => {
      setSchemaText(JSON.stringify(schema, null, 2));
    }, [schema]);

    const pageOptions = useMemo(() => pages.map((page) => ({
      label: page.name,
      value: page.id,
    })), [pages]);

    async function loadPages() {
      try {
        setLoading(true);
        const result = await SchemaPagesApi.list();
        setPages(result);

        if (result.length) {
          await loadPage(result[0].id);
        } else {
          await createInitialPage();
        }
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
      }
    }

    async function createInitialPage() {
      const created = await SchemaPagesApi.create({
        name: pageName,
        schemaJson: JSON.stringify(defaultSchema),
      });

      setPages([created]);
      setActivePageId(created.id);
      setPageName(created.name);
      setSchema(SchemaUtils.ensureNodeIds(JSON.parse(created.schemaJson)));
    }

    async function loadPage(id) {
      const page = await SchemaPagesApi.get(id);
      setActivePageId(page.id);
      setPageName(page.name);
      setSchema(SchemaUtils.ensureNodeIds(JSON.parse(page.schemaJson)));
      DesignerStore.getState().setSelectedNodeId(null);
    }

    async function savePage() {
      try {
        setSaving(true);

        if (!activePageId) {
          const created = await SchemaPagesApi.create({
            name: pageName,
            schemaJson: JSON.stringify(schema),
          });
          setActivePageId(created.id);
          setPages([...pages, created]);
          message.success("Schema created");
          return;
        }

        const updated = await SchemaPagesApi.update(activePageId, {
          name: pageName,
          schemaJson: JSON.stringify(schema),
        });

        setPages((items) => items.map((item) => item.id === updated.id ? updated : item));
        message.success("Schema saved");
      } catch (error) {
        message.error(error.message);
      } finally {
        setSaving(false);
      }
    }

    function handleSchemaTextChange(event) {
      const value = event.target.value;
      setSchemaText(value);

      try {
        const parsed = parseSchemaJson(value);
        setSchemaError("");
        setSchema(parsed);
      } catch (error) {
        setSchemaError(error.message);
      }
    }

    function handleSchemaChange(nextSchema) {
      setSchema(SchemaUtils.ensureNodeIds(nextSchema));
      setSchemaError("");
    }

    function addComponent(componentName, targetNodeId) {
      const targetMatch = SchemaUtils.findNode(schema, targetNodeId);
      const parentId = targetMatch && SchemaUtils.isContainerNode(targetMatch.node)
        ? targetNodeId
        : targetMatch?.parent?.id || schema.id;
      const newNode = SchemaUtils.createDefaultNode(componentName);

      handleSchemaChange(SchemaUtils.insertNode(schema, parentId, newNode, { key: newNode.name }));
      DesignerStore.getState().setSelectedNodeId(newNode.id);
    }

    function moveNode({ sourceId, targetId, placement }) {
      handleSchemaChange(SchemaUtils.moveNode(schema, sourceId, targetId, placement));
    }

    if (loading) {
      return h("div", { className: "schema-designer-loading" }, h(Spin), h(Typography.Text, null, "Loading schema..."));
    }

    return h(
      ConfigProvider,
      {
        theme: {
          algorithm: theme.defaultAlgorithm,
          token: {
            borderRadius: 6,
            colorPrimary: "#1677ff",
          },
        },
      },
      h(
        App,
        null,
        h(
          "div",
          { className: "schema-designer-shell" },
          h(
            "div",
            { className: "schema-designer-toolbar" },
            h(
              Space,
              { wrap: true },
              h(Typography.Title, { level: 3 }, "Low-Code Designer"),
              h(Select, {
                className: "schema-page-select",
                value: activePageId,
                options: pageOptions,
                onChange: loadPage,
              }),
              h(Input, {
                className: "schema-page-name",
                value: pageName,
                onChange: (event) => setPageName(event.target.value),
              }),
            ),
            h(
              Space,
              null,
              h(Button, { onClick: () => setMode(mode === "designer" ? "runtime" : "designer") }, mode === "designer" ? "Runtime preview" : "Designer mode"),
              h(Button, { type: "primary", loading: saving, onClick: savePage }, "Save schema"),
            ),
          ),
          h(
            "div",
            { className: "schema-designer-grid" },
            h(
              Card,
              { title: "Schema JSON", size: "small", className: "schema-designer-json-panel" },
              h(Input.TextArea, {
                className: "schema-designer-editor",
                value: schemaText,
                spellCheck: false,
                onChange: handleSchemaTextChange,
              }),
              schemaError && h(Typography.Text, { type: "danger" }, schemaError),
            ),
            h(
              Card,
              { title: mode === "designer" ? "Visual designer" : "Runtime preview", size: "small", className: "schema-designer-canvas-card" },
              h(SchemaRenderer, {
                schema,
                mode,
                onMoveNode: moveNode,
                onSubmit: (values) => {
                  setSubmittedValues(values);
                  message.success("Form submitted");
                },
              }),
              submittedValues && h("pre", { className: "schema-demo-output" }, JSON.stringify(submittedValues, null, 2)),
            ),
            h(PropertyPanel, {
              schema,
              onSchemaChange: handleSchemaChange,
              onAddComponent: addComponent,
            }),
          ),
        ),
      ),
    );
  }

  const rootElement = document.getElementById("schema-renderer-root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(h(SchemaDesignerApp));
  }
})(window, React, ReactDOM, antd);
