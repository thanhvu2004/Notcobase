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
            column.fieldType === "reference"
              ? h(app.ReferenceField.ReferencePicker, {
                  value: recordForm[column.name],
                  componentPropsJson: column.componentPropsJson,
                  placeholder: "Select records",
                  onChange: (value) => onRecordFormChange({ ...recordForm, [column.name]: value }),
                })
              : column.fieldType === "checkbox"
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
              : column.fieldType === "select"
                ? (() => {
                    let componentPropsJson = {};
                    try {
                      componentPropsJson = typeof column.componentPropsJson === "string" 
                        ? JSON.parse(column.componentPropsJson) 
                        : (column.componentPropsJson || {});
                    } catch (e) {
                      // ignore parse errors
                    }
                    return h(
                      "select",
                      {
                        className: "form-control",
                        required: column.isRequired,
                        value: recordForm[column.name] ?? "",
                        onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value }),
                      },
                      h("option", { value: "" }, "-- Select --"),
                      (componentPropsJson.options || []).map((option) =>
                        h("option", { key: option, value: option }, option)
                      )
                    );
                  })()
            : column.fieldType === "longtext"
              ? h("textarea", {
                  className: "form-control",
                  rows: 4,
                  required: column.isRequired,
                  value: recordForm[column.name] ?? "",
                  onChange: (event) => onRecordFormChange({ ...recordForm, [column.name]: event.target.value }),
                })
                : h("input", {
                    className: "form-control",
                    type: 
                      column.fieldType === "number" ? "number" : 
                      column.fieldType === "date" ? "date" : 
                      column.fieldType === "url" ? "url" : 
                      column.fieldType === "finance" ? "number" : 
                      column.fieldType === "file" ? "file" :
                      "text",
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
