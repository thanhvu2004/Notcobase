(function (app, React) {
const h = React.createElement;
const { Modal } = app;

function parseComponentProps(column) {
  try {
    return typeof column.componentPropsJson === "string"
      ? JSON.parse(column.componentPropsJson)
      : (column.componentPropsJson || {});
  } catch {
    return {};
  }
}

function getFieldType(column) {
  return String(column.fieldType || "text").toLowerCase();
}

function renderRecordInput(column, recordForm, onRecordFormChange) {
  const type = getFieldType(column);
  const value = recordForm[column.name];

  if (type === "reference") {
    const componentProps = parseComponentProps(column);
    return h(app.ReferenceField.ReferencePicker, {
      value,
      componentPropsJson: column.componentPropsJson,
      pickerVariant: componentProps.relationshipMode === "related" ? "table" : undefined,
      placeholder: "Select records",
      onChange: (nextValue) => onRecordFormChange({ ...recordForm, [column.name]: nextValue }),
    });
  }

  if (type === "checkbox" || type === "boolean") {
    return h(
      "div",
      { className: "form-check" },
      h("input", {
        className: "form-check-input",
        type: "checkbox",
        checked: Boolean(value),
        onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.checked }),
      }),
      h("label", { className: "form-check-label" }, "Checked"),
    );
  }

  if (type === "select") {
    const componentProps = parseComponentProps(column);
    return h(
      "select",
      {
        className: "form-control",
        required: column.isRequired,
        value: value ?? "",
        onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value }),
      },
      h("option", { value: "" }, "-- Select --"),
      (componentProps.options || []).map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        return h("option", { key: optionValue, value: optionValue }, optionLabel);
      }),
    );
  }

  if (type === "list") {
    return h("input", {
      className: "form-control",
      required: column.isRequired,
      value: Array.isArray(value) ? value.join(", ") : (value ?? ""),
      placeholder: "Comma-separated values",
      onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }),
    });
  }

  if (type === "longtext") {
    return h("textarea", {
      className: "form-control",
      rows: 4,
      required: column.isRequired,
      value: value ?? "",
      onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value }),
    });
  }

  if (type === "file") {
    return h("input", {
      className: "form-control",
      type: "file",
      required: column.isRequired,
      onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.files?.[0]?.name || "" }),
    });
  }

  return h("input", {
    className: "form-control",
    type:
      type === "number" ? "number" :
      type === "date" ? "date" :
      type === "url" ? "url" :
      type === "finance" ? "number" :
      "text",
    required: column.isRequired,
    value: value ?? "",
    onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value }),
  });
}

function CreateRecordModal({ isOpen, activeTable, columns, recordForm, onRecordFormChange, onListItemChange, onAddListItem, onRemoveListItem, onSubmit, onClose, saving }) {
  if (!isOpen || !activeTable) return null;

  return h(
    Modal,
    { title: `Add record to ${activeTable?.name || "table"}`, onClose },
    h(
      "form",
      { onSubmit },
      h(
        "div",
        { className: "modal-body" },
        columns.map((column) =>
          h(
            "div",
            { className: "mb-3", key: column.id },
            h("label", { className: "form-label" }, column.name, column.isRequired && h("span", { className: "text-danger" }, " *"),),
            renderRecordInput(column, recordForm, onRecordFormChange),
          ),
        ),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h("button", { className: "btn btn-success", disabled: saving }, saving ? "Saving..." : "Save record"),
      ),
    ),
  );
}

app.CreateRecordModal = CreateRecordModal;
})(window.Notcobase, React);
