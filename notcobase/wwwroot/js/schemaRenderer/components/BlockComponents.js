(function (window, React, antd) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;
  const {
    Alert,
    Button,
    Card,
    Checkbox,
    DatePicker,
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

  function parseFieldComponentProps(field) {
    try {
      return field.componentPropsJson
        ? typeof field.componentPropsJson === "string"
          ? JSON.parse(field.componentPropsJson || "{}")
          : field.componentPropsJson
        : {};
    } catch {
      return {};
    }
  }

  function getNormalizedFieldType(field) {
    return String(field?.fieldType || "text").toLowerCase();
  }

  function renderFieldInput(field, options = {}) {
    const common = {
      placeholder: field.label,
    };

    const componentProps = parseFieldComponentProps(field);

    switch (getNormalizedFieldType(field)) {
      case "number":
      case "finance":
        return h(InputNumber, { ...common, style: { width: "100%" } });
      case "longtext":
        return h(Input.TextArea, { ...common, rows: 3 });
      case "boolean":
        return h(Switch, null);
      case "date":
        return h(Input, { ...common, type: "date" });
      case "url":
        return h(Input, { ...common, type: "url" });
      case "select":
        {
          const options = Array.isArray(componentProps.options)
            ? componentProps.options.map((option) => {
                if (typeof option === "object") {
                  return option;
                }

                return {
                  label: String(option),
                  value: option,
                };
              })
            : [];

          return h(Select, {
            ...common,
            options,
            allowClear: true,
            style: { width: "100%" },
          });
        }
      case "reference":
        return h(window.Notcobase.ReferenceField.ReferencePicker, {
          ...common,
          componentPropsJson: componentProps,
          pickerVariant: "table",
          parentRecordId: options.parentRecordId,
          parentTableId: options.parentTableId,
        });
      case "list":
        return h(Select, {
          ...common,
          mode: "tags",
          allowClear: true,
          style: { width: "100%" },
        });
      case "file":
        return h(Input, { ...common, type: "file" });
      case "checkbox":
        return h(Checkbox, null);
      default:
        return h(Input, common);
    }
  }

  function getFieldValuePropName(field) {
    const type = getNormalizedFieldType(field);
    return type === "boolean" || type === "checkbox" ? "checked" : "value";
  }

  function getRecordFormLayout(config = {}) {
    const layout = config.formLayout || config.modalFormLayout || "vertical";
    const columns = Number(config.formGridColumns || config.modalFormGridColumns || 2);
    return {
      layout,
      columns: Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 2,
    };
  }

  function getFormGroupKey(config, tableId) {
    if (!config.useFormGroup) {
      return "";
    }

    const explicitKey = String(config.formGroupKey || "").trim();
    if (explicitKey) {
      return explicitKey;
    }

    return tableId ? `table:${tableId}` : "";
  }

  function getFormBlockInstanceKey(schema) {
    return schema?.id || schema?.name || `form-${Math.random().toString(36).slice(2)}`;
  }

  function createFormGroupCoordinator(groupKey) {
    const forms = new Map();
    const schemas = new Map();
    let tableId = null;
    let recordId = null;
    let tableDetails = null;
    let mode = "auto";
    let isEdit = false;
    let allowCreate = true;
    let resetAfterCreate = true;
    let saving = false;
    let values = {};
    let loadedRecord = null;
    const listeners = new Set();

    function notify() {
      listeners.forEach((listener) => listener());
    }

    return {
      groupKey,
      getSnapshot() {
        return { saving, values, tableId, recordId };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      configure(nextConfig) {
        tableId = nextConfig.tableId ?? tableId;
        recordId = nextConfig.recordId ?? recordId;
        tableDetails = nextConfig.tableDetails || tableDetails;
        mode = nextConfig.mode || mode;
        isEdit = Boolean(nextConfig.isEdit);
        allowCreate = nextConfig.allowCreate !== false;
        resetAfterCreate = nextConfig.resetAfterCreate !== false;
        notify();
      },
      register(instanceKey, form, schema) {
        forms.set(instanceKey, form);
        schemas.set(instanceKey, schema);
        if (loadedRecord) {
          const mappedValues = BlockUtils.mapRecordToFormValues(schema, loadedRecord);
          values = {
            ...values,
            ...mappedValues,
          };
          form.setFieldsValue(mappedValues);
        } else {
          form.setFieldsValue(values);
        }
        return () => {
          forms.delete(instanceKey);
          schemas.delete(instanceKey);
        };
      },
      setValues(nextValues, sourceForm) {
        values = BlockUtils.addFieldValueAliases(schemas.values().next().value || {}, {
          ...values,
          ...(nextValues || {}),
        });
        forms.forEach((form) => {
          if (form !== sourceForm) {
            form.setFieldsValue(values);
          }
        });
        notify();
      },
      loadRecord(record, sourceSchema) {
        loadedRecord = record;
        const mappedValues = {};
        schemas.forEach((schema) => {
          Object.assign(mappedValues, BlockUtils.mapRecordToFormValues(schema, record));
        });
        if (!Object.keys(mappedValues).length && sourceSchema) {
          Object.assign(mappedValues, BlockUtils.mapRecordToFormValues(sourceSchema, record));
        }
        this.setValues(mappedValues);
      },
      reset() {
        loadedRecord = null;
        values = {};
        forms.forEach((form) => form.resetFields());
        notify();
      },
      async save({ onRecordSaved }) {
        if (!tableId) {
          return;
        }

        saving = true;
        notify();

        try {
          const payload = {};
          const allValues = { ...values };

          for (const [instanceKey, form] of forms.entries()) {
            const submittedValues = await form.validateFields();
            const schema = schemas.get(instanceKey);
            const formValues = BlockUtils.collectBlockFormValues(schema, form, submittedValues);
            Object.assign(allValues, formValues);
            Object.assign(payload, BlockUtils.buildRecordDataFromSchema(schema, formValues));
          }

          values = allValues;
          const normalizedPayload = BlockUtils.normalizePayloadToTableColumns(payload, tableDetails);

          if (isEdit && recordId) {
            await RecordsApi.update(tableId, recordId, normalizedPayload);
            message.success("Record updated");
            onRecordSaved?.({ tableId, recordId, mode: "edit", formGroupKey: groupKey });
            return;
          }

          if (!allowCreate) {
            message.warning("Create is disabled for this form group");
            return;
          }

          const created = await RecordsApi.create(tableId, normalizedPayload);
          const createdId = window.Notcobase.ReferenceField.getRecordId(created);
          recordId = createdId;
          const relatedPayload = {};
          for (const schema of schemas.values()) {
            Object.assign(relatedPayload, await saveRelatedReferences(schema, allValues, createdId));
          }
          const normalizedRelatedPayload = BlockUtils.normalizePayloadToTableColumns(relatedPayload, tableDetails);
          if (Object.keys(normalizedRelatedPayload).length) {
            await RecordsApi.update(tableId, createdId, normalizedRelatedPayload);
          }
          message.success("Record created");
          onRecordSaved?.({ tableId, recordId: createdId, mode: "create", formGroupKey: groupKey });

          if (resetAfterCreate) {
            this.reset();
          }
        } finally {
          saving = false;
          notify();
        }
      },
    };
  }

  function getFormGroupCoordinator(context, groupKey) {
    if (!groupKey) {
      return null;
    }

    context.formGroups = context.formGroups || new Map();
    if (!context.formGroups.has(groupKey)) {
      context.formGroups.set(groupKey, createFormGroupCoordinator(groupKey));
    }

    return context.formGroups.get(groupKey);
  }

  function RecordFormRenderer({ form, fields, config }) {
    const { layout, columns } = getRecordFormLayout(config);
    const useGrid = layout === "grid";
    const formLayout = useGrid ? "vertical" : layout;
    const fieldItems = (fields || []).map((field) =>
      h(
        Form.Item,
        {
          key: field.name,
          name: field.name,
          label: field.label,
          rules: field.required ? [{ required: true, message: `${field.label} is required` }] : [],
          valuePropName: getFieldValuePropName(field),
        },
        renderFieldInput(field),
      ),
    );

    if (!fieldItems.length) {
      return h(Typography.Text, { type: "secondary" }, "No columns configured for this table.");
    }

    return h(
      Form,
      { form, layout: formLayout },
      useGrid
        ? h(
            "div",
            {
              className: "record-form-grid",
              style: {
                display: "grid",
                gap: "0 16px",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              },
            },
            fieldItems,
          )
        : fieldItems,
    );
  }

  function getBlockColumnKey(column) {
    const dataIndex = Array.isArray(column.dataIndex) ? column.dataIndex.join(".") : column.dataIndex;
    return String(column.key ?? dataIndex ?? column.title);
  }

  function getBlockColumnDataIndex(column) {
    return Array.isArray(column.dataIndex) ? column.dataIndex.join(".") : column.dataIndex || column.key;
  }

  function parseBlockListValue(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== "string") {
      return value == null || value === "" ? [] : [value];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  function isTruthyBlockValue(value) {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
  }

  function formatBlockTableValue(value, fieldType, componentPropsJson) {
    const type = String(fieldType || "").toLowerCase();

    if (type === "checkbox" || type === "boolean") {
      return isTruthyBlockValue(value) ? "Yes" : "No";
    }

    if (type === "list") {
      return parseBlockListValue(value).join(", ");
    }

    if (type === "reference") {
      return window.Notcobase.ReferenceField.stringifyReferenceValue(value, componentPropsJson);
    }

    if (Array.isArray(value)) {
      return value.join(", ");
    }

    if (value === true) {
      return "Yes";
    }

    if (value === false) {
      return "No";
    }

    return String(value ?? "");
  }

  function renderBlockTableValue(value, fieldType, componentPropsJson, record) {
    const type = String(fieldType || "").toLowerCase();

    if (type === "checkbox" || type === "boolean") {
      return h(Checkbox, { checked: isTruthyBlockValue(value), disabled: true });
    }

    if (type === "reference") {
      return h(window.Notcobase.ReferenceField.ReferenceDisplay, {
        value,
        componentPropsJson,
        parentRecordId: record?.__recordId || record?.id,
      });
    }

    const displayValue = formatBlockTableValue(value, fieldType, componentPropsJson);
    return displayValue === "" ? "—" : displayValue;
  }

  async function saveRelatedReferences(schema, values, parentRecordId) {
    const tasks = [];
    const relatedPayload = {};

    function collect(node) {
      SchemaUtils.sortSchemaEntries(node?.properties).forEach(([key, childSchema]) => {
        if (childSchema?.properties) {
          collect(childSchema);
        }

        if (SchemaUtils.inferComponent(childSchema) !== "Reference") {
          return;
        }

        const fieldName = childSchema["x-field"] || key;
        const value = values?.[key] ?? values?.[fieldName];
        const props = childSchema["x-component-props"] || {};
        if (props.relationshipMode === "related" && value) {
          const config = {
            ...props,
            sourceFieldName: fieldName,
          };
          tasks.push(
            window.Notcobase.ReferenceField.saveRelatedDrafts(value, config, parentRecordId)
              .then((ids) => {
                relatedPayload[fieldName] = window.Notcobase.ReferenceField.stringifyReferenceValue({ ids, drafts: [] }, config);
              }),
          );
        }
      });
    }

    collect(schema);
    await Promise.all(tasks);
    return relatedPayload;
  }

  function compareBlockTableValues(left, right, dataIndex, fieldType) {
    const leftValue = left?.[dataIndex];
    const rightValue = right?.[dataIndex];
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);

    if (leftValue == null || leftValue === "") {
      return rightValue == null || rightValue === "" ? 0 : 1;
    }

    if (rightValue == null || rightValue === "") {
      return -1;
    }

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return formatBlockTableValue(leftValue, fieldType).localeCompare(formatBlockTableValue(rightValue, fieldType), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function TableBlockColumnMenu({ column, columnKey, sortState, onOpenMenu }) {
    const sorted = sortState.columnKey === columnKey;

    return h(
      Button,
      {
        size: "small",
        type: "text",
        className: `records-column-menu-toggle ${sorted ? "is-active" : ""}`,
        "aria-label": `${column.title} column options`,
        title: `${column.title} column options`,
        onClick: (event) => onOpenMenu(columnKey, event),
      },
      "⋮",
    );
  }

  function DetailCardBlock({ schema, context, props, children }) {
    const config = BlockUtils.getBlockConfig(schema);
    const tableId = config.tableId;
    const recordId = BlockUtils.resolveRecordId(config, context.runtimeContext);
    const [form] = Form.useForm();
    const [, forceVisibilityRefresh] = useState(0);
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
            const mappedValues = BlockUtils.mapRecordToFormValues(
              schema,
              record,
            );

            form.setFieldsValue(mappedValues);
            context.refreshVisibility?.(mappedValues);
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
    const urlMode = BlockUtils.getQueryParam("mode");
    const mode = urlMode || context.runtimeContext?.mode || config.mode || "auto";
    const isView = mode === "view";
    const isEdit = !isView && (mode === "edit" || (mode === "auto" && Boolean(recordId)));
    const [form] = Form.useForm();
    const [, forceVisibilityRefresh] = useState(0);
    const [, forceGroupRefresh] = useState(0);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [tableDetails, setTableDetails] = useState(null);
    const designer = isDesignerMode(context);
    const formGroupKey = getFormGroupKey(config, tableId);
    const formGroup = designer ? null : getFormGroupCoordinator(context, formGroupKey);
    const formInstanceKey = useMemo(() => getFormBlockInstanceKey(schema), [schema]);
    const groupSnapshot = formGroup?.getSnapshot() || {};
    const showSubmit = !formGroup || config.showGroupSubmit !== false;
    const buttonLoading = formGroup ? Boolean(groupSnapshot.saving) : submitting;

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
      if (!formGroup) {
        return;
      }

      return formGroup.register(formInstanceKey, form, schema);
    }, [formGroup, formInstanceKey, form, schema]);

    useEffect(() => {
      if (!formGroup) {
        return;
      }

      return formGroup.subscribe(() => {
        forceGroupRefresh((value) => value + 1);
      });
    }, [formGroup]);

    useEffect(() => {
      if (!formGroup) {
        return;
      }

      formGroup.configure({
        tableId,
        recordId,
        tableDetails,
        mode,
        isEdit,
        allowCreate: config.allowCreate,
        resetAfterCreate: config.resetAfterCreate,
      });
    }, [formGroup, tableId, recordId, tableDetails, mode, isEdit, config.allowCreate, config.resetAfterCreate]);

    useEffect(() => {
      if (designer || !tableId || !recordId || (!isEdit && !isView)) {
        return;
      }

      const loadKey = `${formGroupKey || "single"}:${tableId}:${recordId}`;
      context.loadedFormGroupRecords = context.loadedFormGroupRecords || new Set();
      if (formGroup && context.loadedFormGroupRecords.has(loadKey)) {
        return;
      }

      if (formGroup) {
        context.loadedFormGroupRecords.add(loadKey);
      }

      let cancelled = false;

      async function loadRecord() {
        try {
          setLoading(true);
          setError("");
          const record = await RecordsApi.get(tableId, recordId);
          if (!cancelled) {
            if (formGroup) {
              formGroup.loadRecord(record, schema);
              context.refreshVisibility?.(formGroup.getSnapshot().values);
            } else {
              const mappedValues = BlockUtils.mapRecordToFormValues(schema, record);
              form.setFieldsValue(mappedValues);
              context.refreshVisibility?.(mappedValues);
            }
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
    }, [designer, tableId, recordId, isEdit, isView, schema, form, formGroup, formGroupKey]);

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
        if (formGroup) {
          await formGroup.save({ onRecordSaved: context.onRecordSaved });
          context.refreshVisibility?.(formGroup.getSnapshot().values);
          return;
        }

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
        const createdId = window.Notcobase.ReferenceField.getRecordId(created);
        const relatedPayload = await saveRelatedReferences(schema, values, createdId);
        const normalizedRelatedPayload = BlockUtils.normalizePayloadToTableColumns(relatedPayload, tableDetails);
        if (Object.keys(normalizedRelatedPayload).length) {
          await RecordsApi.update(tableId, createdId, normalizedRelatedPayload);
        }
        message.success("Record created");
        context.onRecordSaved?.({ tableId, recordId: createdId, mode: "create" });

        if (config.resetAfterCreate !== false) {
          form.resetFields();
        }
      } catch (submitError) {
        if (submitError?.errorFields) {
          return;
        }
        message.error(submitError.message || "Failed to save record");
      } finally {
        if (!formGroup) {
          setSubmitting(false);
        }
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
        formGroup?.reset();
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
        extra: tableId ? `Table #${tableId} · ${isView ? "View mode" : isEdit ? "Edit mode" : "Create mode"}${formGroupKey ? ` · Group ${formGroupKey}` : ""}` : "Configure a data source table in properties.",
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
            disabled: isView,
            // disabled: designer,
            onValuesChange: (_, allValues) => {
              const mergedValues = {
                ...(context.runtimeFormValues || {}),
                ...allValues,
              };
              formGroup?.setValues(allValues, form);
              context.refreshVisibility?.(mergedValues);
              forceVisibilityRefresh((value) => value + 1);
            },
          },
          children,
          !designer && tableId && !isView && showSubmit && h(
            Form.Item,
            null,
            h(
              Space,
              null,
              h(Button, {
                type: "primary",
                loading: buttonLoading,
                onClick: () => formGroup ? handleSubmit({}) : form.submit(),
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
    const [sortState, setSortState] = useState({ columnKey: null, direction: null });
    const [filters, setFilters] = useState({});
    const [hiddenColumns, setHiddenColumns] = useState({});
    const [showColumnManager, setShowColumnManager] = useState(false);
    const [activeMenu, setActiveMenu] = useState(null);
    const designer = isDesignerMode(context);

    const formFields = useMemo(
      () => BlockUtils.buildFormFieldsFromColumns(tableDetails?.columns),
      [tableDetails],
    );

    const baseColumns = useMemo(() => {
      const tableColumnMap = new Map(
        (tableDetails?.columns || []).map((column) => [String(column.name).toLowerCase(), column]),
      );

      return BlockUtils.buildColumnsFromTable(tableDetails, config.columns).map((column) => {
        const dataIndex = getBlockColumnDataIndex(column);
        const tableColumn = tableColumnMap.get(String(dataIndex || column.title).toLowerCase());
        const fieldType = column.fieldType || tableColumn?.fieldType;
        const componentPropsJson = column.componentPropsJson || tableColumn?.componentPropsJson;

        return {
          ...column,
          fieldType,
          componentPropsJson,
          key: getBlockColumnKey(column),
          render: (value, record) => renderBlockTableValue(value, fieldType, componentPropsJson, record),
        };
      });
    }, [tableDetails, config.columns]);

    const columnKeys = useMemo(() => baseColumns.map(getBlockColumnKey), [baseColumns]);
    const columnSignature = columnKeys.join("|");

    useEffect(() => {
      const validKeys = new Set(columnKeys);

      setFilters((current) => {
        const next = {};
        Object.entries(current).forEach(([key, value]) => {
          if (validKeys.has(key) && value) {
            next[key] = value;
          }
        });
        return next;
      });

      setHiddenColumns((current) => {
        const next = {};
        Object.entries(current).forEach(([key, value]) => {
          if (validKeys.has(key) && value) {
            next[key] = value;
          }
        });
        return next;
      });

      setSortState((current) => validKeys.has(current.columnKey) ? current : { columnKey: null, direction: null });
    }, [columnSignature]);

    useEffect(() => {
      if (!activeMenu) {
        return undefined;
      }

      function handleWindowChange() {
        setActiveMenu(null);
      }

      window.addEventListener("resize", handleWindowChange);
      window.addEventListener("scroll", handleWindowChange, true);

      return () => {
        window.removeEventListener("resize", handleWindowChange);
        window.removeEventListener("scroll", handleWindowChange, true);
      };
    }, [activeMenu]);

    const visibleBaseColumns = useMemo(
      () => baseColumns.filter((column) => !hiddenColumns[getBlockColumnKey(column)]),
      [baseColumns, hiddenColumns],
    );

    const columns = useMemo(() => {
      const enhancedColumns = visibleBaseColumns.map((column) => {
        const columnKey = getBlockColumnKey(column);
        const sorted = sortState.columnKey === columnKey ? sortState.direction : null;
        const filtered = Boolean(filters[columnKey]);
        const titleText = column.title || getBlockColumnDataIndex(column);

        return {
          ...column,
          title: h(
            "div",
            { className: "records-table-heading-content schema-table-block-heading" },
            h("span", { className: "records-table-heading-label" }, titleText),
            h(
              "button",
              {
                type: "button",
                className: `records-quick-sort ${sorted ? "is-active" : ""}`,
                "aria-label": `Quick sort ${titleText}`,
                title: sorted === "asc" ? "Sorted ascending. Click for descending." : sorted === "desc" ? "Sorted descending. Click to clear." : "Sort ascending",
                onClick: () => toggleQuickSort(columnKey),
              },
              sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕",
            ),
            filtered && h("span", { className: "records-filter-indicator" }, "Filtered"),
            h(TableBlockColumnMenu, {
              column: { ...column, title: titleText },
              columnKey,
              sortState,
              onOpenMenu: openColumnMenu,
            }),
          ),
        };
      });

      if (designer || (!config.allowEdit && !config.allowDelete)) {
        return enhancedColumns;
      }

      return [
        ...enhancedColumns,
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
    }, [visibleBaseColumns, sortState, filters, designer, config.allowEdit, config.allowDelete]);

    async function loadData() {
      if (!tableId) {
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [details, rows] = await Promise.all([
          TablesApi.get(tableId),
          RecordsApi.list(tableId),
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
      if (config.createAction === "navigate") {
        const navigated = BlockUtils.navigate({
          targetPageId: config.createTargetPageId,
          targetUrl: config.createTargetUrl,
          navigationParams: {
            tableId,
            mode: "create",
            ...(config.createNavigationParams || {}),
          },
        }, { tableId, mode: "create" });
        if (!navigated) {
          message.warning("Select a create target page first");
        }
        return;
      }

      setEditingRecord(null);
      form.resetFields();
      setModalOpen(true);
    }

    function openEdit(record) {
      if (config.editAction === "navigate") {
        const recordId = record?.__recordId || record?.id;
        const navigated = BlockUtils.navigate({
          targetPageId: config.editTargetPageId,
          targetUrl: config.editTargetUrl,
          navigationParams: {
            id: recordId,
            recordId,
            tableId,
            mode: "edit",
            ...(config.editNavigationParams || {}),
          },
        }, { ...record, id: recordId, recordId, tableId, mode: "edit" });
        if (!navigated) {
          message.warning("Select an edit target page first");
        }
        return;
      }

      setEditingRecord(record);
      const values = {};
      formFields.forEach((field) => {
        values[field.name] = record[field.name];
      });
      form.setFieldsValue(values);
      setModalOpen(true);
    }

    function openRecord(record) {
      if (config.rowClickAction !== "navigate") {
        return;
      }

      const recordId = record?.__recordId || record?.id;
      const navigated = BlockUtils.navigate({
        targetPageId: config.rowTargetPageId,
        targetUrl: config.rowTargetUrl,
        navigationParams: {
          id: recordId,
          recordId,
          tableId,
          mode: config.rowMode || "view",
          ...(config.rowNavigationParams || {}),
        },
      }, { ...record, id: recordId, recordId, tableId, mode: config.rowMode || "view" });
      if (!navigated) {
        message.warning("Select a row target page first");
      }
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
        formFields.forEach((field) => {
          const props = parseFieldComponentProps(field);
          if (getNormalizedFieldType(field) === "reference" && props.relationshipMode === "related") {
            payload[field.name] = window.Notcobase.ReferenceField.stringifyReferenceValue(values[field.name], props);
          }
        });

        const normalizedPayload = BlockUtils.normalizePayloadToTableColumns(payload, tableDetails);

        if (editingRecord?.__recordId) {
          await RecordsApi.update(tableId, editingRecord.__recordId, normalizedPayload);
          const relatedPayload = {};
          for (const field of formFields) {
            const props = parseFieldComponentProps(field);
            if (getNormalizedFieldType(field) === "reference" && props.relationshipMode === "related") {
              const relatedConfig = {
                ...props,
                sourceFieldName: field.name,
              };
              const ids = await window.Notcobase.ReferenceField.saveRelatedDrafts(values[field.name], relatedConfig, editingRecord.__recordId);
              relatedPayload[field.name] = window.Notcobase.ReferenceField.stringifyReferenceValue({ ids, drafts: [] }, relatedConfig);
            }
          }
          const normalizedRelatedPayload = BlockUtils.normalizePayloadToTableColumns(relatedPayload, tableDetails);
          if (Object.keys(normalizedRelatedPayload).length) {
            await RecordsApi.update(tableId, editingRecord.__recordId, normalizedRelatedPayload);
          }
          message.success("Record updated");
        } else {
          const created = await RecordsApi.create(tableId, normalizedPayload);
          const createdId = window.Notcobase.ReferenceField.getRecordId(created);
          const relatedPayload = {};
          for (const field of formFields) {
            const props = parseFieldComponentProps(field);
            if (getNormalizedFieldType(field) === "reference" && props.relationshipMode === "related") {
              const relatedConfig = {
                ...props,
                sourceFieldName: field.name,
              };
              const ids = await window.Notcobase.ReferenceField.saveRelatedDrafts(values[field.name], relatedConfig, createdId);
              relatedPayload[field.name] = window.Notcobase.ReferenceField.stringifyReferenceValue({ ids, drafts: [] }, relatedConfig);
            }
          }
          const normalizedRelatedPayload = BlockUtils.normalizePayloadToTableColumns(relatedPayload, tableDetails);
          if (Object.keys(normalizedRelatedPayload).length) {
            await RecordsApi.update(tableId, createdId, normalizedRelatedPayload);
          }
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

    function setColumnSort(columnKey, direction) {
      setSortState((current) =>
        current.columnKey === columnKey && current.direction === direction
          ? { columnKey: null, direction: null }
          : { columnKey, direction },
      );
    }

    function toggleQuickSort(columnKey) {
      setSortState((current) => {
        if (current.columnKey !== columnKey) {
          return { columnKey, direction: "asc" };
        }

        if (current.direction === "asc") {
          return { columnKey, direction: "desc" };
        }

        return { columnKey: null, direction: null };
      });
    }

    function setColumnFilter(columnKey, value) {
      setFilters((current) => ({
        ...current,
        [columnKey]: value,
      }));
    }

    function clearColumn(columnKey) {
      setFilters((current) => {
        const next = { ...current };
        delete next[columnKey];
        return next;
      });

      setSortState((current) => current.columnKey === columnKey ? { columnKey: null, direction: null } : current);
    }

    function hideColumn(columnKey) {
      if (visibleBaseColumns.length <= 1) {
        return;
      }

      setHiddenColumns((current) => ({ ...current, [columnKey]: true }));
    }

    function toggleColumn(columnKey, checked) {
      if (!checked && visibleBaseColumns.length <= 1) {
        return;
      }

      setHiddenColumns((current) => {
        const next = { ...current };

        if (checked) {
          delete next[columnKey];
        } else {
          next[columnKey] = true;
        }

        return next;
      });
    }

    function showAllColumns() {
      setHiddenColumns({});
    }

    function clearAllControls() {
      setSortState({ columnKey: null, direction: null });
      setFilters({});
      setHiddenColumns({});
    }

    function openColumnMenu(columnKey, event) {
      event.stopPropagation();

      const rect = event.currentTarget.getBoundingClientRect();
      const menuWidth = 232;
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);

      setActiveMenu((current) =>
        current?.columnKey === columnKey
          ? null
          : {
              columnKey,
              left: Math.max(8, left),
              top: rect.bottom + 6,
              width: menuWidth,
            },
      );
    }

    function closeColumnMenu() {
      setActiveMenu(null);
    }

    function runMenuAction(action) {
      action();
      closeColumnMenu();
    }

    const dataSource = designer
      ? (config.previewData || props.dataSource || [])
      : records;

    const displayDataSource = useMemo(() => {
      const filteredRows = dataSource.filter((record) =>
        baseColumns.every((column) => {
          const columnKey = getBlockColumnKey(column);
          const filterValue = filters[columnKey];

          if (!filterValue) {
            return true;
          }

          const dataIndex = getBlockColumnDataIndex(column);
          return formatBlockTableValue(record?.[dataIndex], column.fieldType)
            .toLowerCase()
            .includes(filterValue.toLowerCase());
        }),
      );

      if (!sortState.columnKey || !sortState.direction) {
        return filteredRows;
      }

      const sortColumn = baseColumns.find((column) => getBlockColumnKey(column) === sortState.columnKey);
      if (!sortColumn) {
        return filteredRows;
      }

      const dataIndex = getBlockColumnDataIndex(sortColumn);
      return [...filteredRows].sort((left, right) => {
        const result = compareBlockTableValues(left, right, dataIndex, sortColumn.fieldType);
        return sortState.direction === "asc" ? result : -result;
      });
    }, [baseColumns, dataSource, filters, sortState]);

    const activeFilterCount = Object.values(filters).filter(Boolean).length;

    function renderActiveColumnMenu() {
      if (!activeMenu || !window.ReactDOM?.createPortal) {
        return null;
      }

      const column = baseColumns.find((item) => getBlockColumnKey(item) === activeMenu.columnKey);
      if (!column) {
        return null;
      }

      const columnKey = activeMenu.columnKey;
      const titleText = column.title || getBlockColumnDataIndex(column);
      const isSorted = sortState.columnKey === columnKey;
      const filterValue = filters[columnKey] || "";

      return window.ReactDOM.createPortal(
        h(
          React.Fragment,
          null,
          h("button", {
            type: "button",
            className: "records-column-menu-backdrop",
            "aria-label": "Close column menu",
            onClick: closeColumnMenu,
          }),
          h(
            "div",
            {
              className: "records-column-menu-panel",
              style: {
                left: activeMenu.left,
                top: activeMenu.top,
                width: activeMenu.width,
              },
              onClick: (event) => event.stopPropagation(),
            },
            h("div", { className: "records-column-menu-title" }, titleText),
            h(
              "button",
              {
                type: "button",
                className: `records-column-menu-item ${isSorted && sortState.direction === "asc" ? "active" : ""}`,
                onClick: () => runMenuAction(() => setColumnSort(columnKey, "asc")),
              },
              "Sort ascending",
            ),
            h(
              "button",
              {
                type: "button",
                className: `records-column-menu-item ${isSorted && sortState.direction === "desc" ? "active" : ""}`,
                onClick: () => runMenuAction(() => setColumnSort(columnKey, "desc")),
              },
              "Sort descending",
            ),
            h(
              "button",
              {
                type: "button",
                className: "records-column-menu-item",
                disabled: !isSorted && !filterValue,
                onClick: () => runMenuAction(() => clearColumn(columnKey)),
              },
              "Clear sort/filter",
            ),
            h("div", { className: "records-column-menu-divider" }),
            h("label", { className: "form-label records-column-filter-label", htmlFor: `schema-filter-${columnKey}` }, "Filter"),
            h("input", {
              id: `schema-filter-${columnKey}`,
              type: "search",
              className: "form-control form-control-sm",
              placeholder: "Contains...",
              value: filterValue,
              onChange: (event) => setColumnFilter(columnKey, event.target.value),
            }),
            h("div", { className: "records-column-menu-divider" }),
            h(
              "button",
              {
                type: "button",
                className: "records-column-menu-item",
                disabled: visibleBaseColumns.length <= 1,
                onClick: () => runMenuAction(() => hideColumn(columnKey)),
              },
              "Hide column",
            ),
            h(
              "button",
              {
                type: "button",
                className: "records-column-menu-item",
                onClick: () => runMenuAction(() => setShowColumnManager(true)),
              },
              "Manage columns",
            ),
          ),
        ),
        document.body,
      );
    }

    return h(
      React.Fragment,
      null,
      h(
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
        h(
          "div",
          { className: "records-table-toolbar schema-table-block-toolbar" },
          h("div", { className: "text-muted small" }, `${displayDataSource.length} of ${dataSource.length} records`, activeFilterCount > 0 && `, ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}`),
          h(
            Space,
            { size: 8 },
            h(Button, {
              size: "small",
              onClick: clearAllControls,
              disabled: !sortState.columnKey && activeFilterCount === 0 && visibleBaseColumns.length === baseColumns.length,
            }, "Reset view"),
            h(Button, {
              size: "small",
              onClick: () => setShowColumnManager((value) => !value),
            }, "Manage columns"),
          ),
        ),
        showColumnManager && h(
          "div",
          { className: "records-column-manager schema-table-block-column-manager" },
          h(
            "div",
            { className: "records-column-manager-header" },
            h("span", { className: "fw-semibold" }, "Columns"),
            h(Button, { type: "link", size: "small", onClick: showAllColumns }, "Show all"),
          ),
          h(
            "div",
            { className: "records-column-manager-list" },
            baseColumns.map((column) => {
              const columnKey = getBlockColumnKey(column);
              const checked = !hiddenColumns[columnKey];
              const titleText = column.title || getBlockColumnDataIndex(column);

              return h(
                "label",
                { key: columnKey, className: "records-column-manager-item" },
                h("input", {
                  type: "checkbox",
                  className: "form-check-input",
                  checked,
                  disabled: checked && visibleBaseColumns.length <= 1,
                  onChange: (event) => toggleColumn(columnKey, event.target.checked),
                }),
                h("span", null, titleText),
              );
            }),
          ),
        ),
        h(antd.Table, {
          rowKey: "id",
          size: props.size || "small",
          loading,
          columns,
          dataSource: displayDataSource,
          pagination: { pageSize },
          onRow: (record) => ({
            onClick: (event) => {
              if (event.target.closest?.("button,a,input,select,textarea,.ant-dropdown,.records-column-menu-toggle")) {
                return;
              }
              openRecord(record);
            },
            ...(config.rowClickAction === "navigate" ? { style: { cursor: "pointer" } } : {}),
          }),
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
                    required: Boolean(field.required),
                    rules: field.required ? [{ required: true, message: `${field.label} is required` }] : [],
                    valuePropName: getNormalizedFieldType(field) === "file" ? "data-value" : getFieldValuePropName(field),
                    getValueFromEvent: getNormalizedFieldType(field) === "file"
                      ? (event) => event?.target?.files?.[0]?.name || ""
                      : undefined,
                  },
                  renderFieldInput(field, {
                    parentRecordId: editingRecord?.__recordId,
                    parentTableId: tableId,
                  }),
                ),
              ),
            )
            : h(Typography.Text, { type: "secondary" }, "No columns configured for this table."),
        ),
      ),
      renderActiveColumnMenu(),
    );
  }

  window.Notcobase.BlockComponents = {
    DetailCard: DetailCardBlock,
    FormBlock,
    TableBlock,
  };
})(window, React, antd);
