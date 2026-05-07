(function (app, React) {
const h = React.createElement;
const { Modal } = app;

function EditTableModal({ isOpen, editingTable, editTableForm, tables, onFormChange, onSubmit, onClose, saving }) {
  if (!isOpen || !editingTable) return null;

  const otherTables = tables.filter((table) => table.id !== editingTable.id);

  return h(
    Modal,
    { title: `Edit ${editingTable.name}`, onClose },
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
          value: editTableForm.name,
          onChange: (event) => onFormChange({ ...editTableForm, name: event.target.value }),
        }),
        h("label", { className: "form-label" }, "Description"),
        h("textarea", {
          className: "form-control mb-3",
          rows: 3,
          value: editTableForm.description,
          onChange: (event) => onFormChange({ ...editTableForm, description: event.target.value }),
        }),
        h(
          "div",
          { className: "form-check mb-3" },
          h("input", {
            id: "editInheritProperties",
            className: "form-check-input",
            type: "checkbox",
            checked: editTableForm.inheritProperties,
            disabled: otherTables.length === 0,
            onChange: (event) =>
              onFormChange({
                ...editTableForm,
                inheritProperties: event.target.checked,
                parentTableId: event.target.checked ? editTableForm.parentTableId : "",
              }),
          }),
          h("label", { className: "form-check-label", htmlFor: "editInheritProperties" }, "Inherit properties from another table"),
        ),
        editTableForm.inheritProperties &&
          h(
            "div",
            { className: "mb-1" },
            h("label", { className: "form-label" }, "Parent table"),
            h(
              "select",
              {
                className: "form-select",
                required: true,
                value: editTableForm.parentTableId,
                onChange: (event) => onFormChange({ ...editTableForm, parentTableId: event.target.value }),
              },
              h("option", { value: "" }, "Select parent table"),
              otherTables.map((table) =>
                h(
                  "option",
                  { key: table.id, value: table.id },
                  `${table.name} (${table.columnCount || 0} fields)`,
                ),
              ),
            ),
          ),
        otherTables.length === 0 &&
          h("div", { className: "form-text" }, "Create another table first before enabling inherited properties."),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h(
          "button",
          {
            className: "btn btn-primary",
            disabled: saving || (editTableForm.inheritProperties && !editTableForm.parentTableId),
          },
          saving ? "Saving..." : "Save changes",
        ),
      ),
    ),
  );
}

app.EditTableModal = EditTableModal;
})(window.Notcobase, React);
