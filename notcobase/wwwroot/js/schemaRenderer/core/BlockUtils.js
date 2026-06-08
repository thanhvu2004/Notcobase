(function (window) {
  window.Notcobase = window.Notcobase || {};
  const { SchemaUtils } = window.Notcobase;

  function getQueryParam(name) {
    if (!name) {
      return null;
    }

    return new URLSearchParams(window.location.search).get(name);
  }

  function resolveRecordId(blockProps, runtimeContext) {
    const props = blockProps || {};

    if (props.recordId != null && props.recordId !== "") {
      return Number(props.recordId);
    }

    if (runtimeContext?.recordId != null && runtimeContext.recordId !== "") {
      return Number(runtimeContext.recordId);
    }

    const fromUrl = getQueryParam(props.recordIdParam || "id");
    if (fromUrl) {
      return Number(fromUrl);
    }

    return null;
  }

  function getBlockConfig(schema) {
    return schema?.["x-component-props"] || {};
  }

  function getFieldName(propertyKey, propertySchema) {
    return propertySchema?.["x-field"] || propertyKey;
  }

  function resolveFormValue(values, propertyKey, fieldName) {
    if (!values || typeof values !== "object") {
      return undefined;
    }

    if (values[propertyKey] !== undefined) {
      return values[propertyKey];
    }

    if (fieldName !== propertyKey && values[fieldName] !== undefined) {
      return values[fieldName];
    }

    const match = Object.entries(values).find(([entryKey]) => (
      entryKey.toLowerCase() === propertyKey.toLowerCase()
      || entryKey.toLowerCase() === fieldName.toLowerCase()
    ));

    return match ? match[1] : undefined;
  }

  function isDataFieldNode(childSchema) {
    const componentName = SchemaUtils.inferComponent(childSchema);
    return !["Button", "Action", "Divider", "Empty", "Alert", "Text", "Title"].includes(componentName);
  }

  function buildRecordDataFromSchema(schema, values) {
    const payload = {};

    SchemaUtils.sortSchemaEntries(schema?.properties).forEach(([key, childSchema]) => {
      if (!isDataFieldNode(childSchema)) {
        return;
      }

      const fieldName = getFieldName(key, childSchema);
      const value = resolveFormValue(values, key, fieldName);

      if (value !== undefined && value !== null) {
        payload[fieldName] = value;
      }
    });

    return payload;
  }

  function normalizePayloadToTableColumns(payload, tableDetails) {
    const columnNames = (tableDetails?.columns || []).map((column) => column.name);
    if (!columnNames.length) {
      return payload;
    }

    const normalized = {};

    Object.entries(payload || {}).forEach(([key, value]) => {
      const match = columnNames.find((name) => name.toLowerCase() === String(key).toLowerCase());
      if (match) {
        normalized[match] = value;
      }
    });

    return normalized;
  }

  function collectBlockFormValues(schema, form, submittedValues) {
    const formValues = typeof form?.getFieldsValue === "function"
      ? form.getFieldsValue(true)
      : {};

    return {
      ...formValues,
      ...(submittedValues || {}),
    };
  }

  function mapRecordToFormValues(schema, record) {
    const data = record?.data || {};
    const values = {};

    SchemaUtils.sortSchemaEntries(schema?.properties).forEach(([key, childSchema]) => {
      const fieldName = getFieldName(key, childSchema);
      const match = Object.entries(data).find(([columnName]) => columnName.toLowerCase() === fieldName.toLowerCase());
      if (match) {
        values[key] = match[1];
      }
    });

    return values;
  }

  function buildColumnsFromTable(tableDetails, configuredColumns) {
    if (Array.isArray(configuredColumns) && configuredColumns.length) {
      return configuredColumns;
    }

    return (tableDetails?.columns || []).map((column) => ({
      title: column.name,
      dataIndex: column.name,
      key: column.name,
    }));
  }

  function buildFormFieldsFromColumns(columns) {
    return (columns || []).map((column) => ({
      componentPropsJson: column.componentPropsJson,
      componentDefinitionId: column.componentDefinitionId,
      name: column.name,
      label: column.name,
      fieldType: column.fieldType,
      required: column.isRequired,
    }));
  }

  function fieldTypeToSchemaComponent(fieldType) {
    const type = String(fieldType || "text").toLowerCase();

    switch (type) {
      case "number":
        return { schemaType: "number", component: "InputNumber" };
      case "date":
        return { schemaType: "string", component: "DatePicker", format: "date" };
      case "boolean":
      case "checkbox":
        return { schemaType: "boolean", component: "Switch" };
      case "select":
        return { schemaType: "string", component: "Select" };
      default:
        return { schemaType: "string", component: "Input" };
    }
  }

  function sanitizePropertyKey(columnName) {
    const key = String(columnName || "field").replace(/[^a-zA-Z0-9_]/g, "_");
    return /^[a-zA-Z_]/.test(key) ? key : `field_${key}`;
  }

  function findPropertyKeyForColumn(properties, columnName) {
    return Object.entries(properties || {}).find(([key, node]) => {
      const fieldName = node?.["x-field"] || key;
      return fieldName.toLowerCase() === String(columnName).toLowerCase();
    })?.[0];
  }

  function getFormBlockSelectedColumns(node) {
    const config = getBlockConfig(node);
    if (Array.isArray(config.formColumns)) {
      return config.formColumns;
    }

    const selected = [];
    SchemaUtils.sortSchemaEntries(node?.properties).forEach(([key, childSchema]) => {
      if (!isDataFieldNode(childSchema)) {
        return;
      }

      selected.push(childSchema["x-field"] || key);
    });

    return selected;
  }

  function createPropertySchemaFromColumn(column, index) {
    const mapping = fieldTypeToSchemaComponent(column.fieldType);
    const propertyKey = sanitizePropertyKey(column.name);
    const schema = {
      id: SchemaUtils.createNodeId(propertyKey),
      type: mapping.schemaType,
      title: column.name,
      "x-component": mapping.component,
      "x-field": column.name,
      "x-index": index,
      "x-component-props": {
        placeholder: column.name,
      },
      name: propertyKey,
    };

    if (mapping.format) {
      schema.format = mapping.format;
    }

    if (column.isRequired) {
      schema.required = true;
    }

    return { propertyKey, schema };
  }

  function clearTableBoundProperties(node, tableColumns) {
    const tableColumnNames = new Set((tableColumns || []).map((column) => column.name.toLowerCase()));

    Object.keys(node.properties || {}).forEach((key) => {
      const child = node.properties[key];
      const fieldName = (child?.["x-field"] || key).toLowerCase();
      if (tableColumnNames.has(fieldName)) {
        delete node.properties[key];
      }
    });
  }

  function applyFormBlockColumnSelection(node, tableColumns, selectedColumnNames) {
    const draft = SchemaUtils.cloneSchema(node);
    draft.properties = draft.properties || {};
    draft["x-component-props"] = draft["x-component-props"] || {};

    const selectedSet = new Set((selectedColumnNames || []).map((name) => name.toLowerCase()));
    const tableColumnNames = new Set((tableColumns || []).map((column) => column.name.toLowerCase()));

    Object.keys(draft.properties).forEach((key) => {
      const child = draft.properties[key];
      const fieldName = (child?.["x-field"] || key).toLowerCase();
      if (tableColumnNames.has(fieldName) && !selectedSet.has(fieldName)) {
        delete draft.properties[key];
      }
    });

    const requiredKeys = [];

    (selectedColumnNames || []).forEach((columnName, index) => {
      const column = (tableColumns || []).find((item) => item.name.toLowerCase() === columnName.toLowerCase());
      if (!column) {
        return;
      }

      const { propertyKey, schema } = createPropertySchemaFromColumn(column, index);
      const existingKey = findPropertyKeyForColumn(draft.properties, column.name);
      let targetKey = existingKey || propertyKey;

      if (draft.properties[targetKey] && (draft.properties[targetKey]["x-field"] || targetKey) !== column.name) {
        let suffix = 1;
        while (draft.properties[`${propertyKey}_${suffix}`]) {
          suffix += 1;
        }
        targetKey = `${propertyKey}_${suffix}`;
      }

      draft.properties[targetKey] = {
        ...(existingKey ? draft.properties[existingKey] : {}),
        ...schema,
        id: existingKey ? draft.properties[existingKey].id : schema.id,
        "x-index": index,
      };

      if (column.isRequired) {
        requiredKeys.push(targetKey);
      }
    });

    if (requiredKeys.length) {
      draft.required = requiredKeys;
    } else {
      delete draft.required;
    }

    draft["x-component-props"].formColumns = [...selectedColumnNames];
    SchemaUtils.normalizeIndexes(draft);

    return draft;
  }

  function applyFormBlockTableChange(node, tableColumns, tableId) {
    const draft = SchemaUtils.cloneSchema(node);
    draft["x-component-props"] = draft["x-component-props"] || {};
    draft["x-component-props"].tableId = tableId ?? null;
    draft["x-component-props"].formColumns = [];

    if (tableColumns?.length) {
      clearTableBoundProperties(draft, tableColumns);
    } else {
      draft.properties = {};
    }

    delete draft.required;
    return draft;
  }

  window.Notcobase.BlockUtils = {
    applyFormBlockColumnSelection,
    applyFormBlockTableChange,
    buildColumnsFromTable,
    buildFormFieldsFromColumns,
    buildRecordDataFromSchema,
    collectBlockFormValues,
    createPropertySchemaFromColumn,
    fieldTypeToSchemaComponent,
    getFormBlockSelectedColumns,
    getBlockConfig,
    getFieldName,
    getQueryParam,
    mapRecordToFormValues,
    normalizePayloadToTableColumns,
    resolveFormValue,
    resolveRecordId,
    sanitizePropertyKey,
  };
})(window);
