(function (window) {
  window.Notcobase = window.Notcobase || {};
  const { SchemaUtils } = window.Notcobase;

  function getQueryParam(name) {
    if (!name) {
      return null;
    }

    return new URLSearchParams(window.location.search).get(name);
  }

  function resolveNavigationValue(value, data = {}) {
    if (typeof value !== "string") {
      return value;
    }

    const exactMatch = value.match(/^\{([^}]+)\}$/);
    if (exactMatch) {
      return data[exactMatch[1]] ?? "";
    }

    return value.replace(/\{([^}]+)\}/g, (_, key) => data[key] ?? "");
  }

  function normalizeNavigationParams(params) {
    if (!params) {
      return {};
    }

    if (typeof params === "string") {
      try {
        const parsed = JSON.parse(params);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    return typeof params === "object" && !Array.isArray(params) ? params : {};
  }

  function buildNavigationUrl(config = {}, data = {}) {
    const targetUrl = String(config.targetUrl || "").trim();
    const targetPageId = config.targetPageId ?? config.navigatePageId;
    const baseUrl = targetUrl || (targetPageId ? "/SchemaRenderer" : "");

    if (!baseUrl) {
      return "";
    }

    const url = new URL(baseUrl, window.location.origin);
    if (!targetUrl && targetPageId) {
      url.searchParams.set("pageId", targetPageId);
    }

    const params = {
      ...normalizeNavigationParams(config.params),
      ...normalizeNavigationParams(config.navigationParams),
    };

    Object.entries(params).forEach(([key, value]) => {
      const resolved = resolveNavigationValue(value, data);
      if (resolved !== undefined && resolved !== null && resolved !== "") {
        url.searchParams.set(key, resolved);
      }
    });

    return `${url.pathname}${url.search}${url.hash}`;
  }

  function navigate(config = {}, data = {}) {
    const url = buildNavigationUrl(config, data);
    if (!url) {
      return false;
    }

    window.location.href = url;
    return true;
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

    function collectProperties(node) {
      SchemaUtils.sortSchemaEntries(node?.properties).forEach(([key, childSchema]) => {
        const hasChildren = childSchema?.properties && Object.keys(childSchema.properties).length > 0;

        if (hasChildren) {
          collectProperties(childSchema);
        }

        if (!isDataFieldNode(childSchema)) {
          return;
        }

        const fieldName = getFieldName(key, childSchema);
        const value = resolveFormValue(values, key, fieldName);

        if (value !== undefined && value !== null) {
          payload[fieldName] = value;
        }
      });
    }

    collectProperties(schema);
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

  function getValueByAlias(values, field) {
    if (!values || !field) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(values, field)) {
      return values[field];
    }

    const normalizedField = String(field).normalize("NFC").toLowerCase();
    const match = Object.entries(values).find(([key]) => String(key).normalize("NFC").toLowerCase() === normalizedField);
    return match ? match[1] : undefined;
  }

  function normalizeVisibilityValue(value) {
    if (value == null) {
      return "";
    }

    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }

    return String(value);
  }

  function visibilityValuesEqual(left, right) {
    if (left === right) {
      return true;
    }

    return normalizeVisibilityValue(left) === normalizeVisibilityValue(right);
  }

  function addFieldValueAliases(schema, values) {
    const aliasedValues = { ...(values || {}) };

    function addAliasesForNode(node, propertyKey) {
      if (!node || typeof node !== "object") {
        return;
      }

      const aliases = [
        propertyKey,
        node.name,
        node["x-field"],
        node.title,
      ].filter(Boolean);

      const sourceAlias = aliases.find((alias) => Object.prototype.hasOwnProperty.call(aliasedValues, alias));
      if (sourceAlias) {
        const sourceValue = aliasedValues[sourceAlias];
        aliases.forEach((alias) => {
          aliasedValues[alias] = sourceValue;
        });
      }

      SchemaUtils.sortSchemaEntries(node.properties).forEach(([childKey, childSchema]) => {
        addAliasesForNode(childSchema, childKey);
      });
    }

    addAliasesForNode(schema, schema?.name || "root");
    return aliasedValues;
  }

  function evaluateVisibleWhen(rule, values) {
    if (!rule?.field) {
      return true;
    }

    const currentValue = getValueByAlias(values, rule.field);

    switch (rule.operator || "=") {
      case "=":
        return visibilityValuesEqual(currentValue, rule.value);
      case "!=":
        return !visibilityValuesEqual(currentValue, rule.value);
      case "contains":
        return Array.isArray(currentValue)
          ? currentValue.some((item) => visibilityValuesEqual(item, rule.value))
          : String(currentValue || "").includes(String(rule.value));
      default:
        return true;
    }
  }

  function collectBlockFormValues(schema, form, submittedValues) {
    const formValues = typeof form?.getFieldsValue === "function"
      ? form.getFieldsValue(true)
      : {};

    const mergedValues = {
      ...formValues,
      ...(submittedValues || {}),
    };
    const aliasedValues = addFieldValueAliases(schema, mergedValues);

    function isVisible(node) {
      return evaluateVisibleWhen(
        node?.["x-component-props"]?.visibleWhen,
        aliasedValues,
      );
    }

    function removeHiddenFields(node) {
      SchemaUtils.sortSchemaEntries(node?.properties).forEach(([key, childSchema]) => {
        if (childSchema?.properties) {
          removeHiddenFields(childSchema);
        }

        if (!isVisible(childSchema)) {
          const fieldName = childSchema?.["x-field"] || key;
          delete mergedValues[key];
          delete mergedValues[fieldName];
          delete aliasedValues[key];
          delete aliasedValues[fieldName];
        }
      });
    }

    removeHiddenFields(schema);

    return mergedValues;
  }

  function mapRecordToFormValues(schema, record) {
    const data = record?.data || {};
    const values = {};

    function mapProperties(node) {
      SchemaUtils.sortSchemaEntries(node?.properties).forEach(([key, childSchema]) => {
        const hasChildren = childSchema?.properties && Object.keys(childSchema.properties).length > 0;

        if (hasChildren) {
          mapProperties(childSchema);
        }

        const fieldName = getFieldName(key, childSchema);
        const match = Object.entries(data).find(([columnName]) => columnName.toLowerCase() === fieldName.toLowerCase());

        if (match) {
          values[key] = match[1];
        }
      });
    }

    mapProperties(schema);
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
      case "reference":
        return { schemaType: "array", component: "Reference" };
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

  function collectFormBlockFieldNodes(node, results = []) {
    SchemaUtils.sortSchemaEntries(node?.properties).forEach(([key, childSchema]) => {
      const fieldName = childSchema?.["x-field"] || key;

      if (isDataFieldNode(childSchema) && childSchema?.["x-field"]) {
        results.push({
          key,
          fieldName,
          node: childSchema,
          parentProperties: node.properties,
        });
      }

      if (childSchema?.properties) {
        collectFormBlockFieldNodes(childSchema, results);
      }
    });

    return results;
  }

  function removeUnselectedFieldsRecursively(node, selectedSet, tableColumnNames) {
    Object.keys(node?.properties || {}).forEach((key) => {
      const child = node.properties[key];
      const fieldName = (child?.["x-field"] || key).toLowerCase();

      if (child?.properties) {
        removeUnselectedFieldsRecursively(child, selectedSet, tableColumnNames);
      }

      if (tableColumnNames.has(fieldName) && !selectedSet.has(fieldName)) {
        delete node.properties[key];
      }
    });
  }

  function getFormBlockSelectedColumns(node) {
    const config = getBlockConfig(node);
    if (Array.isArray(config.formColumns)) {
      return config.formColumns;
    }

    return collectFormBlockFieldNodes(node).map((item) => item.fieldName);
  }

  function createPropertySchemaFromColumn(column, index) {
    const mapping = fieldTypeToSchemaComponent(column.fieldType);
    const propertyKey = sanitizePropertyKey(column.name);
    const componentProps = column.componentPropsJson ? (typeof column.componentPropsJson === "string" ? JSON.parse(column.componentPropsJson) : column.componentPropsJson) : {};
    const schema = {
      id: SchemaUtils.createNodeId(propertyKey),
      type: mapping.schemaType,
      title: column.name,
      "x-component": mapping.component,
      "x-field": column.name,
      "x-index": index,
      "x-component-props": {
        placeholder: column.name,
        ...(String(column.fieldType || "").toLowerCase() === "reference" ? { pickerVariant: "table" } : {}),
        ...componentProps,
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

    removeUnselectedFieldsRecursively(
      draft,
      selectedSet,
      tableColumnNames,
    );

    const requiredKeys = [];

    (selectedColumnNames || []).forEach((columnName, index) => {
      const column = (tableColumns || []).find((item) => item.name.toLowerCase() === columnName.toLowerCase());
      if (!column) {
        return;
      }

      const existingField = collectFormBlockFieldNodes(draft)
        .find((item) => item.fieldName.toLowerCase() === column.name.toLowerCase());

      const existingKey = existingField?.key;
      const existingParentProperties = existingField?.parentProperties;

      if (existingField) {
        existingParentProperties[existingKey] = {
          ...existingParentProperties[existingKey],
          ...createPropertySchemaFromColumn(column, index).schema,
          id: existingParentProperties[existingKey].id,
          "x-index": index,
        };

        if (column.isRequired) {
          requiredKeys.push(existingKey);
        }

        return;
      }

      let targetKey = sanitizePropertyKey(column.name);

      if (draft.properties[targetKey] && (draft.properties[targetKey]["x-field"] || targetKey) !== column.name) {
        let suffix = 1;
        while (draft.properties[`${targetKey}_${suffix}`]) {
          suffix += 1;
        }
        targetKey = `${targetKey}_${suffix}`;
      }

      draft.properties[targetKey] = {
        ...(existingKey ? draft.properties[existingKey] : {}),
        ...createPropertySchemaFromColumn(column, index).schema,
        id: existingKey ? draft.properties[existingKey].id : createPropertySchemaFromColumn(column, index).schema.id,
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
    addFieldValueAliases,
    collectBlockFormValues,
    createPropertySchemaFromColumn,
    evaluateVisibleWhen,
    fieldTypeToSchemaComponent,
    getFormBlockSelectedColumns,
    getBlockConfig,
    getFieldName,
    getQueryParam,
    buildNavigationUrl,
    mapRecordToFormValues,
    navigate,
    normalizePayloadToTableColumns,
    resolveFormValue,
    resolveRecordId,
    sanitizePropertyKey,
  };
})(window);
