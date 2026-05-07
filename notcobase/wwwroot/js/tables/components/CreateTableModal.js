(function (app, React) {
const h = React.createElement;
const { Modal } = app;

function CreateTableModal({ isOpen, tableForm, parentTableOptions, onFormChange, onSubmit, onClose, saving }) {
  if (!isOpen) return null;

  return h(
    Modal,
    { title: "Create table", onClose },
    h(
      "form",
      { onSubmit },
      h(
        "div",
        { className: "modal-body" },
        h("label", { className: "form-label" }, "Name"),
        h("input", {
          className: "form-control mb-3",
          autoFocus: true,
          required: true,
          value: tableForm.name,
          onChange: (event) => onFormChange({ ...tableForm, name: event.target.value }),
        }),
        h("label", { className: "form-label" }, "Description"),
        h("textarea", {
          className: "form-control mb-3",
          rows: 3,
          value: tableForm.description,
          onChange: (event) => onFormChange({ ...tableForm, description: event.target.value }),
        }),
        h(
          "div",
          { className: "form-check mb-3" },
          h("input", {
            id: "inheritProperties",
            className: "form-check-input",
            type: "checkbox",
            checked: tableForm.inheritProperties,
            disabled: parentTableOptions.length === 0,
            onChange: (event) =>
              onFormChange({
                ...tableForm,
                inheritProperties: event.target.checked,
                parentTableId: event.target.checked ? tableForm.parentTableId : "",
              }),
          }),
          h("label", { className: "form-check-label", htmlFor: "inheritProperties" }, "Inherit properties from another table"),
        ),
        tableForm.inheritProperties &&
          h(
            "div",
            { className: "mb-1" },
            h("label", { className: "form-label" }, "Parent table"),
            h(
              "select",
              {
                className: "form-select",
                required: true,
                value: tableForm.parentTableId,
                onChange: (event) => onFormChange({ ...tableForm, parentTableId: event.target.value }),
              },
              h("option", { value: "" }, "Select parent table"),
              parentTableOptions.map((table) =>
                h(
                  "option",
                  { key: table.id, value: table.id },
                  `${table.name} (${table.columnCount || 0} fields)`,
                ),
              ),
            ),
          ),
        parentTableOptions.length === 0 &&
          h("div", { className: "form-text" }, "Create one table first before enabling inherited properties."),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h(
          "button",
          {
            className: "btn btn-primary",
            disabled: saving || (tableForm.inheritProperties && !tableForm.parentTableId),
          },
          saving ? "Creating..." : "Create",
        ),
      ),
    ),
  );
}

app.CreateTableModal = CreateTableModal;
})(window.Notcobase, React);
