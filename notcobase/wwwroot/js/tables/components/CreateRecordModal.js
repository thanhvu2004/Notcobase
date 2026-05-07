(function (app, React) {
const h = React.createElement;
const { Modal } = app;

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
            column.fieldType === "checkbox"
              ? h(
                  "div",
                  { className: "form-check" },
                  h("input", {
                    className: "form-check-input",
                    type: "checkbox",
                    checked: Boolean(recordForm[column.name]),
                    onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.checked }),
                  }),
                  h("label", { className: "form-check-label" }, "Checked"),
                )
              : column.fieldType === "list"
                ? h(
                    "div",
                    null,
                    (Array.isArray(recordForm[column.name]) ? recordForm[column.name] : [""]).map((item, itemIndex) =>
                      h(
                        "div",
                        { className: "input-group mb-2", key: itemIndex },
                        h("input", {
                          className: "form-control",
                          required: column.isRequired && itemIndex === 0,
                          value: item,
                          placeholder: `Item ${itemIndex + 1}`,
                          onChange: (event) => onListItemChange(column.name, itemIndex, event.target.value),
                        }),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "btn btn-outline-danger",
                            disabled: (recordForm[column.name] || [""]).length === 1,
                            onClick: () => onRemoveListItem(column.name, itemIndex),
                          },
                          "Remove",
                        ),
                      ),
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn btn-sm btn-outline-primary",
                        onClick: () => onAddListItem(column.name),
                      },
                      "Add item",
                    ),
                  )
                : h("input", {
                    className: "form-control",
                    type: column.fieldType === "number" ? "number" : column.fieldType === "date" ? "date" : "text",
                    required: column.isRequired,
                    value: recordForm[column.name] ?? "",
                    onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value }),
                  }),
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
