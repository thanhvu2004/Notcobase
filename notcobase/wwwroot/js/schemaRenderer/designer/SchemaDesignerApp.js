(function (window, React, ReactDOM, antd) {
  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;
  const { App, Button, Card, ConfigProvider, Input, Select, Space, Spin, Typography, message, theme } = antd;
  const {
    BlockUtils,
    DesignerStore,
    PropertyPanel,
    SchemaPagesApi,
    SchemaRenderer,
    SchemaUtils,
    TablesApi,
  } = window.Notcobase;

  const defaultSchema = SchemaUtils.ensureNodeIds({
    "type": "object",
    "name": "NewPage",
    "title": "New Page",
    "x-component": "Container",
    "x-component-props": {
      "layout": "vertical"
    },
    "required": [
      "name"
    ],
    "properties": {},
  });

  function parseSchemaJson(value) {
    const parsed = JSON.parse(value);
    return SchemaUtils.ensureNodeIds(parsed);
  }

  function SchemaDesignerApp() {
    const [pages, setPages] = useState([]);
    const [activePageId, setActivePageId] = useState(null);
    const [pageName, setPageName] = useState("New page");
    const [schema, setSchema] = useState(defaultSchema);
    const [schemaText, setSchemaText] = useState(JSON.stringify(defaultSchema, null, 2));
    const [mode, setMode] = useState("runtime");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schemaError, setSchemaError] = useState("");
    const [submittedValues, setSubmittedValues] = useState(null);
    const [tables, setTables] = useState([]);
    const [runtimeRecordId, setRuntimeRecordId] = useState("");

    function replacePageUrl(pageId) {
      const url = new URL(window.location.href);
      url.search = "";
      if (pageId) {
        url.searchParams.set("pageId", pageId);
      }
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    useEffect(() => {
      loadPages();
      TablesApi.list()
        .then(setTables)
        .catch((error) => message.error(error.message));
    }, []);

    useEffect(() => {
      function handleMetadataChange(event) {
        if (event.key !== "notcobase:schema-metadata-changed" || !event.newValue) {
          return;
        }

        TablesApi.list()
          .then(setTables)
          .catch((error) => message.error(error.message));

        if (activePageId) {
          loadPage(activePageId)
            .then(() => message.info("Schema metadata refreshed"))
            .catch((error) => message.error(error.message));
        }
      }

      window.addEventListener("storage", handleMetadataChange);
      return () => window.removeEventListener("storage", handleMetadataChange);
    }, [activePageId]);

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

        const pageIdFromUrl = Number(BlockUtils?.getQueryParam?.("pageId"));
        const initialPage = result.find((page) => page.id === pageIdFromUrl) || result[0];

        if (result.length) {
          await loadPage(initialPage.id);
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
      replacePageUrl(created.id);
    }

    async function loadPage(id) {
      const page = await SchemaPagesApi.get(id);
      setActivePageId(page.id);
      setPageName(page.name);
      setSchema(SchemaUtils.ensureNodeIds(JSON.parse(page.schemaJson)));
      DesignerStore.getState().setSelectedNodeId(null);
    }

    async function selectPage(id) {
      await loadPage(id);
      replacePageUrl(id);
      setRuntimeRecordId("");
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
          replacePageUrl(created.id);
          setRuntimeRecordId("");
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

    function createNewPage() {
      setActivePageId(null);
      setPageName("New page");
      setSchema(defaultSchema);
      replacePageUrl(null);
      setRuntimeRecordId("");
      DesignerStore.getState().setSelectedNodeId(null);
    }

    function deleteCurrentPage() {
      if (!activePageId) {
        message.warning("No page to delete");
        return;
      }

      if (!window.confirm("Are you sure you want to delete this page? This action cannot be undone.")) {
        return;
      }
      
      SchemaPagesApi.delete(activePageId)
        .then(() => {
          const remainingPages = pages.filter((item) => item.id !== activePageId);
          setPages(remainingPages);

          if (remainingPages.length > 0) {
            selectPage(remainingPages[0].id);
          } else {
            createNewPage();
          }

          message.success("Schema page deleted");
        })
        .catch((error) => message.error(error.message));
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

    function deleteNode(nodeId) {
      const result = SchemaUtils.removeNode(schema, nodeId);

      if (!result.removed) {
        message.warning("Cannot remove the root component");
        return;
      }

      if (SchemaUtils.inferComponent(result.removed) === "Reference") {
        const props = result.removed["x-component-props"] || {};
        window.Notcobase.ReferenceField?.cleanupParentLinkColumn?.({
          ...props,
          sourceFieldName: result.removed["x-field"],
          parentFieldName: props.parentFieldName || result.removed["x-field"] || "",
        }).catch((error) => {
          message.error(error.message || "Failed to remove old parent link field");
        });
      }

      handleSchemaChange(result.schema);
      DesignerStore.getState().clearInteractionState();
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
              h(Select, {
                className: "schema-page-select",
                value: activePageId,
                options: pageOptions,
                onChange: selectPage,
              }),
              h(Input, {
                className: "schema-page-name",
                value: pageName,
                onChange: (event) => setPageName(event.target.value),
              }),
              h(Button, { onClick: createNewPage }, "New page"),
              h(Button, { danger: true, onClick: deleteCurrentPage }, "Delete page"),
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
            { className: mode === "designer" ? "schema-designer-grid" : "none" },
            // mode === "designer" && h(
            //   Card,
            //   { title: "Schema JSON", size: "small", className: "schema-designer-json-panel" },
            //   h(Input.TextArea, {
            //     className: "schema-designer-editor",
            //     value: schemaText,
            //     spellCheck: false,
            //     onChange: handleSchemaTextChange,
            //     ref: (el) => {
            //       if (el) {
            //         const textarea = el.resizableTextArea?.textArea || el;
            //         textarea.style.height = "auto";
            //         textarea.style.height = `${textarea.scrollHeight + 3}px`;
            //       }
            //     },
            //   }),
            //   schemaError && h(Typography.Text, { type: "danger" }, schemaError),
            // ),
            h(
              Card,
              { title: mode === "designer" ? "Visual designer" : "Runtime preview", size: "small", className: "schema-designer-canvas-card" },
              h(SchemaRenderer, {
                schema,
                mode,
                runtimeContext: {
                  recordId: runtimeRecordId ? Number(runtimeRecordId) : null,
                  mode: BlockUtils.getQueryParam("mode"),
                },
                onMoveNode: moveNode,
                onDeleteNode: deleteNode,
                onAddComponent: addComponent,
                onSubmit: (values) => {
                  setSubmittedValues(values);
                  message.success("Form submitted");
                },
              }),
              mode === "runtime" &&
                h(
                  "div",
                  { className: "schema-runtime-controls" },
                  h(Typography.Text, null, "Preview record ID"),
                  h(Input, {
                    style: { maxWidth: 180 },
                    placeholder: "e.g. 1",
                    value: runtimeRecordId,
                    onChange: (event) => setRuntimeRecordId(event.target.value),
                  }),
                ),
              submittedValues && h("pre", { className: "schema-demo-output" }, JSON.stringify(submittedValues, null, 2)),
            ),
            mode === "designer" && h(PropertyPanel, {
              schema,
              tables,
              pages,
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
