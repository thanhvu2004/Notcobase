(function (app, React) {
const h = React.createElement;
const { Modal, FIELD_TYPES } = app;

function EditFieldModal({ isOpen, editingColumn, editFieldForm, onFormChange, onSubmit, onClose, saving }) {
  if (!isOpen || !editingColumn) return null;

  return h(
    Modal,
    { title: `Edit field ${editingColumn.name}`, onClose },
    h(
      "form",
      { onSubmit },
      h(
        "div",
        { className: "modal-body" },
        h("label", { className: "form-label" }, "Field name"),
        h("input", {
          className: "form-control mb-3",
          autoFocus: true,
          required: true,
          value: editFieldForm.name,
          onChange: (event) => onFormChange({ ...editFieldForm, name: event.target.value }),
        }),
        h("label", { className: "form-label" }, "Field type"),
        h(
          "select",
          {
            className: "form-select mb-3",
            value: editFieldForm.fieldType,
            onChange: (event) => onFormChange({ ...editFieldForm, fieldType: event.target.value }),
          },
          FIELD_TYPES.map((type) => h("option", { key: type, value: type }, type)),
        ),
        h(
          "div",
          { className: "form-check" },
          h("input", {
            id: "editFieldRequired",
            className: "form-check-input",
            type: "checkbox",
            checked: editFieldForm.isRequired,
            onChange: (event) => onFormChange({ ...editFieldForm, isRequired: event.target.checked }),
          }),
          h("label", { className: "form-check-label", htmlFor: "editFieldRequired" }, "Required"),
        ),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h("button", { className: "btn btn-primary", disabled: saving }, saving ? "Saving..." : "Save changes"),
      ),
    ),
  );
}

app.EditFieldModal = EditFieldModal;
})(window.Notcobase, React);
