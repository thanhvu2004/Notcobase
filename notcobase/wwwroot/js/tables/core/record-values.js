(function (app) {
  function emptyRecord(columns) {
    return columns.reduce((values, column) => {
      if (column.fieldType === "checkbox") {
        values[column.name] = false;
      } else if (column.fieldType === "reference") {
        values[column.name] = [];
      } else if (column.fieldType === "select") {
        let defaultValue = "";
        try {
          const props = typeof column.componentPropsJson === "string" 
            ? JSON.parse(column.componentPropsJson) 
            : column.componentPropsJson;
          defaultValue = props?.defaultValue ?? "";
        } catch (e) {
          // ignore parse errors
        }
        values[column.name] = defaultValue;
      } else {
        values[column.name] = "";
      }

      return values;
    }, {});
  }

  function cleanListItems(value) {
    let parsedValue = value;
    // if value is a JSON string like '["A","B"]'
    if (typeof parsedValue === "string") {
      try {
        parsedValue = JSON.parse(parsedValue);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(parsedValue)) {
      return [];
    }
    
    return parsedValue
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  function coerceRecordValue(value, fieldType, componentPropsJson) { // coerce value to the appropriate type based on fieldType
    if (fieldType === "number") {
      return value === "" ? null : Number(value);
    }

    if (fieldType === "checkbox") {
      return Boolean(value);
    }

    if (fieldType === "select") {
      return String(value ?? "");
    }

    if (fieldType === "reference") {
      return app.ReferenceField.stringifyReferenceValue(
        value,
        app.ReferenceField.parseProps(componentPropsJson),
      );
    }

    return value;
  }

  function formatRecordValue(value, fieldType) { // format value for display based on fieldType
    if (fieldType === "checkbox") {
      return value === "1" ? "Yes" : "No";
    }

    if (fieldType === "select") {
      return String(value ?? "");
    }

    if (fieldType === "reference") {
      return app.ReferenceField.stringifyReferenceValue(value);
    }

    return String(value ?? "");
  }

  app.emptyRecord = emptyRecord;
  app.coerceRecordValue = coerceRecordValue;
  app.formatRecordValue = formatRecordValue;
})(window.Notcobase);
