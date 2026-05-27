(function (window, React, antd) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;
  const {
    Alert,
    Button,
    Card,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Typography,
    message,
  } = antd;

  const { BlockUtils, RecordsApi, SchemaUtils, TablesApi } = window.Notcobase;

  function isDesignerMode(context) {
    return context?.mode === "designer";
  }

  function BlockStatusBanner({ type, message: bannerMessage, extra }) {
    return h(Alert, {
      type,
      showIcon: true,
      message: bannerMessage,
      description: extra,
      style: { marginBottom: 12 },
    });
  }

  function renderFieldInput(field) {
    const common = {
      placeholder: field.label,
    };

    switch ((field.fieldType || "text").toLowerCase()) {
      case "number":
        return h(InputNumber, { ...common, style: { width: "100%" } });
      case "boolean":
        return h(Switch, null);
      default:
        return h(Input, common);
    }
  }

  function DetailCardBlock({ schema, context, props, children }) {
    const config = BlockUtils.getBlockConfig(schema);
    const tableId = config.tableId;
    const recordId = BlockUtils.resolveRecordId(config, context.runtimeContext);
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [tableDetails, setTableDetails] = useState(null);

    const designer = isDesignerMode(context);

    useEffect(() => {
      if (!tableId || designer) {
        setTableDetails(null);
        return;
      }

      let cancelled = false;
      TablesApi.get(tableId)
        .then((details) => {
          if (!cancelled) {
            setTableDetails(details);
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError.message);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [tableId, designer]);

    useEffect(() => {
      if (designer || !tableId || !recordId) {
        return;
      }

      let cancelled = false;

      async function loadRecord() {
        try {
          setLoading(true);
          setError("");
          const record = await RecordsApi.get(tableId, recordId);
          if (!cancelled) {
            form.setFieldsValue(BlockUtils.mapRecordToFormValues(schema, record));
          }
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError.message);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }

      loadRecord();
      return () => {
        cancelled = true;
      };
    }, [designer, tableId, recordId, schema, form]);

    function buildPayload(values) {
      return BlockUtils.normalizePayloadToTableColumns(
        BlockUtils.buildRecordDataFromSchema(schema, values),
        tableDetails,
      );
    }

    async function handleSave() {
      try {
        const submittedValues = await form.validateFields();
        const values = BlockUtils.collectBlockFormValues(schema, form, submittedValues);
        setSaving(true);
        await RecordsApi.update(tableId, recordId, buildPayload(values));
        message.success("Record saved");
      } catch (saveError) {
        if (saveError?.errorFields) {
          return;
        }
        message.error(saveError.message || "Failed to save record");
      } finally {
        setSaving(false);
      }
    }

    async function handleDelete() {
      try {
        await RecordsApi.remove(tableId, recordId);
        message.success("Record deleted");
        context.onRecordDeleted?.({ tableId, recordId });
      } catch (deleteError) {
        message.error(deleteError.message || "Failed to delete record");
      }
    }

    const actions = [];
    if (!designer && config.allowEdit !== false && tableId && recordId) {
      actions.push(h(Button, { key: "save", type: "primary", loading: saving, onClick: handleSave }, "Save"));
    }
    if (!designer && config.allowDelete && tableId && recordId) {
      actions.push(
        h(
          Popconfirm,
          { key: "delete", title: "Delete this record?", onConfirm: handleDelete },
          h(Button, { danger: true }, "Delete"),
        ),
      );
    }

    return h(
      Card,
      {
        title: props.title || schema.title || "Detail card",
        bordered: props.bordered !== false,
        extra: actions.length ? h(Space, null, actions) : null,
        className: "schema-block schema-block-detail-card",
      },
      designer && h(BlockStatusBanner, {
        type: "info",
        message: "DetailCard",
        extra: tableId ? `Table #${tableId}${recordId ? ` · Record #${recordId}` : " · Record from URL param"}` : "Configure a data source table in properties.",
      }),
      !designer && !tableId && h(BlockStatusBanner, { type: "warning", message: "Select a data source table for this block." }),
      !designer && tableId && !recordId && h(BlockStatusBanner, { type: "warning", message: "Set a record ID or pass it via URL query param." }),
      error && h(BlockStatusBanner, { type: "error", message: error }),
      h(
        Spin,
        { spinning: loading },
        h(
          Form,
          {
            form,
            component: false,
            layout: config.layout || "vertical",
            disabled: designer || config.allowEdit === false,
          },
          children,
        ),
      ),
    );
  }

  function FormBlock({ schema, context, props, children }) {
    const config = BlockUtils.getBlockConfig(schema);
    const tableId = config.tableId;
    const recordId = BlockUtils.resolveRecordId(config, context.runtimeContext);
    const mode = config.mode || "auto";
    const isEdit = mode === "edit" || (mode === "auto" && Boolean(recordId));
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [tableDetails, setTableDetails] = useState(null);
    const designer = isDesignerMode(context);

    useEffect(() => {
      if (!tableId || designer) {
        setTableDetails(null);
        return;
      }

      let cancelled = false;
      TablesApi.get(tableId)
        .then((details) => {
          if (!cancelled) {
            setTableDetails(details);
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError.message);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [tableId, designer]);

    useEffect(() => {
      if (designer || !tableId || !recordId || !isEdit) {
        return;
      }

      let cancelled = false;

      async function loadRecord() {
        try {
          setLoading(true);
          setError("");
          const record = await RecordsApi.get(tableId, recordId);
          if (!cancelled) {
            form.setFieldsValue(BlockUtils.mapRecordToFormValues(schema, record));
          }
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError.message);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }

      loadRecord();
      return () => {
        cancelled = true;
      };
    }, [designer, tableId, recordId, isEdit, schema, form]);

    function buildPayload(values) {
      return BlockUtils.normalizePayloadToTableColumns(
        BlockUtils.buildRecordDataFromSchema(schema, values),
        tableDetails,
      );
    }

    async function handleSubmit(submittedValues) {
      if (designer || !tableId) {
        return;
      }

      try {
        setSubmitting(true);
        const values = BlockUtils.collectBlockFormValues(schema, form, submittedValues);
        const payload = buildPayload(values);

        if (isEdit && recordId) {
          await RecordsApi.update(tableId, recordId, payload);
          message.success("Record updated");
          context.onRecordSaved?.({ tableId, recordId, mode: "edit" });
          return;
        }

        if (config.allowCreate === false) {
          message.warning("Create is disabled for this block");
          return;
        }

        const created = await RecordsApi.create(tableId, payload);
        message.success("Record created");
        context.onRecordSaved?.({ tableId, recordId: created.id, mode: "create" });

        if (config.resetAfterCreate !== false) {
          form.resetFields();
        }
      } catch (submitError) {
        message.error(submitError.message || "Failed to save record");
      } finally {
        setSubmitting(false);
      }
    }

    async function handleDelete() {
      if (!tableId || !recordId) {
        return;
      }

      try {
        await RecordsApi.remove(tableId, recordId);
        message.success("Record deleted");
        form.resetFields();
        context.onRecordDeleted?.({ tableId, recordId });
      } catch (deleteError) {
        message.error(deleteError.message || "Failed to delete record");
      }
    }

    return h(
      Card,
      {
        title: props.title || schema.title || "Form block",
        bordered: props.bordered !== false,
        className: "schema-block schema-block-form",
      },
      designer && h(BlockStatusBanner, {
        type: "info",
        message: "FormBlock",
        extra: tableId ? `Table #${tableId} · ${isEdit ? "Edit mode" : "Create mode"}` : "Configure a data source table in properties.",
      }),
      !designer && !tableId && h(BlockStatusBanner, { type: "warning", message: "Select a data source table for this block." }),
      error && h(BlockStatusBanner, { type: "error", message: error }),
      h(
        Spin,
        { spinning: loading },
        h(
          Form,
          {
            form,
            layout: config.layout || props.layout || "vertical",
            onFinish: handleSubmit,
            disabled: designer,
            onValuesChange: (_, allValues) => {},
          },
          children,
          !designer && tableId && h(
            Form.Item,
            null,
            h(
              Space,
              null,
              h(Button, {
                type: "primary",
                loading: submitting,
                onClick: () => form.submit(),
              }, config.submitLabel || (isEdit ? "Update" : "Create")),
              config.allowDelete && isEdit && recordId &&
                h(
                  Popconfirm,
                  { title: "Delete this record?", onConfirm: handleDelete },
                  h(Button, { danger: true }, "Delete"),
                ),
            ),
          ),
        ),
      ),
    );
  }

  function TableBlock({ schema, context, props }) {
    const config = BlockUtils.getBlockConfig(schema);
    const tableId = config.tableId;
    const pageSize = config.pageSize || props.pagination?.pageSize || 10;
    const [records, setRecords] = useState([]);
    const [tableDetails, setTableDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const designer = isDesignerMode(context);

    const formFields = useMemo(
      () => BlockUtils.buildFormFieldsFromColumns(tableDetails?.columns),
      [tableDetails],
    );

    const columns = useMemo(() => {
      const baseColumns = BlockUtils.buildColumnsFromTable(tableDetails, config.columns).map((column) => ({
        ...column,
        render: (value) => (value == null || value === "" ? "—" : String(value)),
      }));

      if (designer || (!config.allowEdit && !config.allowDelete)) {
        return baseColumns;
      }

      return [
        ...baseColumns,
        {
          title: "Actions",
          key: "__actions",
          width: 160,
          render: (_, record) => h(
            Space,
            null,
            config.allowEdit !== false && h(Button, { size: "small", onClick: () => openEdit(record) }, "Edit"),
            config.allowDelete && h(
              Popconfirm,
              { title: "Delete this record?", onConfirm: () => handleDelete(record.id) },
              h(Button, { size: "small", danger: true }, "Delete"),
            ),
          ),
        },
      ];
    }, [tableDetails, config, designer]);

    async function loadData() {
      if (!tableId) {
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [details, rows] = await Promise.all([
          TablesApi.get(tableId),
          RecordsApi.list(tableId, { limit: pageSize }),
        ]);
        setTableDetails(details);
        setRecords(rows.map((row) => ({ ...row.data, id: row.id, __recordId: row.id })));
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      if (designer) {
        return;
      }
      loadData();
    }, [designer, tableId, pageSize]);

    function openCreate() {
      setEditingRecord(null);
      form.resetFields();
      setModalOpen(true);
    }

    function openEdit(record) {
      setEditingRecord(record);
      const values = {};
      formFields.forEach((field) => {
        values[field.name] = record[field.name];
      });
      form.setFieldsValue(values);
      setModalOpen(true);
    }

    async function handleDelete(recordId) {
      try {
        await RecordsApi.remove(tableId, recordId);
        message.success("Record deleted");
        await loadData();
        context.onRecordDeleted?.({ tableId, recordId });
      } catch (deleteError) {
        message.error(deleteError.message || "Failed to delete record");
      }
    }

    async function handleModalSubmit() {
      try {
        const values = await form.validateFields();
        setSaving(true);
        const payload = { ...values };

        const normalizedPayload = BlockUtils.normalizePayloadToTableColumns(payload, tableDetails);

        if (editingRecord?.__recordId) {
          await RecordsApi.update(tableId, editingRecord.__recordId, normalizedPayload);
          message.success("Record updated");
        } else {
          await RecordsApi.create(tableId, normalizedPayload);
          message.success("Record created");
        }

        setModalOpen(false);
        await loadData();
        context.onRecordSaved?.({ tableId, mode: editingRecord ? "edit" : "create" });
      } catch (submitError) {
        if (submitError?.errorFields) {
          return;
        }
        message.error(submitError.message || "Failed to save record");
      } finally {
        setSaving(false);
      }
    }

    const dataSource = designer
      ? (config.previewData || props.dataSource || [])
      : records;

    return h(
      Card,
      {
        title: props.title || schema.title || "Table block",
        bordered: props.bordered !== false,
        extra: !designer && config.allowCreate !== false && tableId
          ? h(Button, { type: "primary", size: "small", onClick: openCreate }, "Add record")
          : null,
        className: "schema-block schema-block-table",
      },
      designer && h(BlockStatusBanner, {
        type: "info",
        message: "TableBlock",
        extra: tableId ? `Table #${tableId}` : "Configure a data source table in properties.",
      }),
      !designer && !tableId && h(BlockStatusBanner, { type: "warning", message: "Select a data source table for this block." }),
      error && h(BlockStatusBanner, { type: "error", message: error }),
      h(Table, {
        rowKey: "id",
        size: props.size || "small",
        loading,
        columns,
        dataSource,
        pagination: { pageSize },
      }),
      h(
        Modal,
        {
          title: editingRecord ? "Edit record" : "Create record",
          open: modalOpen,
          onCancel: () => setModalOpen(false),
          onOk: handleModalSubmit,
          confirmLoading: saving,
          destroyOnClose: true,
        },
        formFields.length
          ? h(
            Form,
            { form, layout: "vertical" },
            formFields.map((field) =>
              h(
                Form.Item,
                {
                  key: field.name,
                  name: field.name,
                  label: field.label,
                  rules: field.required ? [{ required: true, message: `${field.label} is required` }] : [],
                  valuePropName: field.fieldType === "boolean" ? "checked" : "value",
                },
                renderFieldInput(field),
              ),
            ),
          )
          : h(Typography.Text, { type: "secondary" }, "No columns configured for this table."),
      ),
    );
  }

  window.Notcobase.BlockComponents = {
    DetailCard: DetailCardBlock,
    FormBlock,
    TableBlock,
  };
})(window, React, antd);
