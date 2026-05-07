(function (app, React) {
const h = React.createElement;
const { FIELD_TYPES } = app;

function FieldsList({ columns, fieldForm, onFieldFormChange, onAddField, onEditField, onDeleteField, saving }) {
  return h(
    "div",
    { className: "col-xl-5" },
    h(
      "div",
      { className: "border rounded p-3 h-100" },
      h("h3", { className: "h6 mb-3" }, "Fields"),
      h(
        "form",
        { className: "row g-2 mb-3", onSubmit: onAddField },
        h(
          "div",
          { className: "col-sm-5" },
          h("input", {
            className: "form-control form-control-sm",
            placeholder: "Field name",
            value: fieldForm.name,
            onChange: (event) => onFieldFormChange({ ...fieldForm, name: event.target.value }),
          }),
        ),
        h(
          "div",
          { className: "col-sm-4" },
          h(
            "select",
            {
              className: "form-select form-select-sm",
              value: fieldForm.fieldType,
              onChange: (event) => onFieldFormChange({ ...fieldForm, fieldType: event.target.value }),
            },
            FIELD_TYPES.map((type) => h("option", { key: type, value: type }, type)),
          ),
        ),
        h(
          "div",
          { className: "col-sm-3 d-grid" },
          h("button", { className: "btn btn-sm btn-primary", disabled: saving }, "Add"),
        ),
        h(
          "label",
          { className: "form-check ms-2 small" },
          h("input", {
            className: "form-check-input",
            type: "checkbox",
            checked: fieldForm.isRequired,
            onChange: (event) => onFieldFormChange({ ...fieldForm, isRequired: event.target.checked }),
          }),
          " Required",
        ),
      ),
      columns.length === 0
        ? h("div", { className: "text-muted small" }, "Add fields before creating records.")
        : h(
            "div",
            { className: "d-flex flex-column gap-2" },
            columns.map((column) =>
              h(
                "div",
                { key: column.id, className: "d-flex flex-row gap-2 align-items-center justify-content-between border rounded px-2 py-1" },
                h(
                  "div",
                  { className: "d-flex align-items-center gap-2" },
                  h("span", { className: "fw-semibold" }, column.name),
                  column.isRequired && h("span", { className: "badge text-bg-warning text-danger ms-2" }, "*"),
                ),
                h(
                  "div",
                  { className: "d-flex gap-1 align-items-center" },
                  column.isInherited
                    ? h(
                        "span",
                        {
                          className: "text-muted small",
                        },
                        "Inherited fields must be changed on the parent table"
                      )
                    : [
                        h(
                          "button",
                          {
                            className: "btn btn-sm btn-outline-secondary",
                            onClick: () => onEditField(column),
                          },
                          "Edit"
                        ),

                        h(
                          "button",
                          {
                            className: "btn btn-sm btn-outline-danger",
                            onClick: () => onDeleteField(column),
                          },
                          "Delete"
                        ),
                      ]
                ),
              ),
            ),
          ),
    ),
  );
}

app.FieldsList = FieldsList;
})(window.Notcobase, React);
