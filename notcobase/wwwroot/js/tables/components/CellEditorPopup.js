(function (app, React) {
  const h = React.createElement;

  function CellEditorPopup({
    editor,
    saving,
    onValueChange,
    onListItemChange,
    onListItemRemove,
    onNewItemChange,
    onSave,
    onCancel,
  }) {
    const inputType = editor.fieldType === "number" ? "number" : editor.fieldType === "date" ? "date" : "text";

    return h(
      "div",
      {
        className: "position-fixed bg-white border rounded shadow p-3",
        style: {
          left: editor.position?.left ?? 12,
          top: editor.position?.top ?? 12,
          width: 320,
          maxWidth: "75vw",
          maxHeight: "70vh",
          overflowY: "auto",
          zIndex: 1080,
        },
        onClick: (event) => event.stopPropagation(),
      },
      h(
        "div",
        { className: "small fw-semibold mb-2" },
        editor.fieldType === "list" ? "Edit list items" : "Edit value",
      ),
      editor.fieldType === "checkbox"
        ? h(
            "div",
            { className: "form-check mb-3" },
            h("input", {
              id: `cell-${editor.recordId}-${editor.columnName}`,
              className: "form-check-input",
              type: "checkbox",
              checked: Boolean(editor.value),
              onChange: (event) => onValueChange(event.target.checked),
            }),
            h(
              "label",
              { className: "form-check-label", htmlFor: `cell-${editor.recordId}-${editor.columnName}` },
              "Checked",
            ),
          )
        : editor.fieldType === "list"
          ? h(
              "div",
              null,
              (Array.isArray(editor.value) && editor.value.length > 0 ? editor.value : [""]).map((item, itemIndex) =>
                h(
                  "div",
                  { className: "input-group input-group-sm mb-2", key: itemIndex },
                  h("input", {
                    className: "form-control",
                    value: item,
                    placeholder: `Item ${itemIndex + 1}`,
                    onChange: (event) => onListItemChange(itemIndex, event.target.value),
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "btn btn-outline-danger",
                      onClick: () => onListItemRemove(itemIndex),
                    },
                    "Remove",
                  ),
                ),
              ),
              h("input", {
                className: "form-control form-control-sm mb-3",
                value: editor.newItem,
                placeholder: "New item",
                onChange: (event) => onNewItemChange(event.target.value),
              }),
            )
          : h("input", {
              className: "form-control form-control-sm mb-3",
              autoFocus: true,
              type: inputType,
              required: editor.isRequired,
              value: editor.value,
              onChange: (event) => onValueChange(event.target.value),
            }),
      h(
        "div",
        { className: "d-flex justify-content-end gap-2" },
        h("button", { type: "button", className: "btn btn-sm btn-outline-secondary", onClick: onCancel }, "Cancel"),
        h("button", { type: "button", className: "btn btn-sm btn-primary", disabled: saving, onClick: onSave }, saving ? "Saving..." : "Save"),
      ),
    );
  }

  app.CellEditorPopup = CellEditorPopup;
})(window.Notcobase, React);
