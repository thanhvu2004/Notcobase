(function (app) {
  function emptyRecord(columns) {
    return columns.reduce((values, column) => {
      if (column.fieldType === "checkbox") {
        values[column.name] = false;
      } else if (column.fieldType === "list") {
        values[column.name] = [""];
      } else {
        values[column.name] = "";
      }

      return values;
    }, {});
  }

  function cleanListItems(value) { // ensure value is an array of non-empty trimmed strings
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  function coerceRecordValue(value, fieldType) { // coerce value to the appropriate type based on fieldType
    if (fieldType === "number") {
      return value === "" ? null : Number(value);
    }

    if (fieldType === "checkbox") {
      return Boolean(value);
    }

    if (fieldType === "list") {
      return cleanListItems(value);
    }

    return value;
  }

  function formatRecordValue(value, fieldType) { // format value for display based on fieldType
    if (fieldType === "checkbox") {
      return value ? "Yes" : "No";
    }

    if (fieldType === "list") {
      const items = cleanListItems(value);
      return items.length > 0 ? items.join(", ") : "";
    }

    return String(value ?? "");
  }

  app.emptyRecord = emptyRecord;
  app.cleanListItems = cleanListItems;
  app.coerceRecordValue = coerceRecordValue;
  app.formatRecordValue = formatRecordValue;
})(window.Notcobase);
