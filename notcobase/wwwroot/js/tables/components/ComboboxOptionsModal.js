(function (app, React) {
const h = React.createElement;
const { Modal } = app;
const { useState } = React;

function ComboboxOptionsModal({ isOpen, column, onSave, onClose }) {
  const [options, setOptions] = useState([]);
  const [defaultValue, setDefaultValue] = useState("");
  const [newOption, setNewOption] = useState("");

  React.useEffect(() => {
    if (isOpen && column?.componentPropsJson) {
      try {
        const props = typeof column.componentPropsJson === "string" 
          ? JSON.parse(column.componentPropsJson) 
          : column.componentPropsJson;
        setOptions(props.options || []);
        setDefaultValue(props.defaultValue || "");
      } catch (e) {
        setOptions([]);
        setDefaultValue("");
      }
    } else if (isOpen) {
      setOptions([]);
      setDefaultValue("");
    }
    setNewOption("");
  }, [isOpen, column]);

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (trimmed && !options.includes(trimmed)) {
      const newOptions = [...options, trimmed];
      setOptions(newOptions);
      setNewOption("");
      if (!defaultValue) {
        setDefaultValue(trimmed);
      }
    }
  };

  const handleRemoveOption = (index) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    if (defaultValue === options[index]) {
      setDefaultValue(newOptions.length > 0 ? newOptions[0] : "");
    }
  };

  const handleOptionChange = (index, value) => {
    const old = options[index];
    const next = [...options];
    next[index] = value;
    setOptions(next);
    if (defaultValue === old) {
      setDefaultValue(value);
    }
  };

  const handleSave = () => {
    const propsJson = JSON.stringify({
      options: options,
      defaultValue: defaultValue || "",
    });
    onSave(propsJson);
  };

  if (!isOpen || !column) return null;

  return h(
    Modal,
    { title: `Configure "${column.name}" options`, onClose },
    h(
      "div",
      null,
      h(
        "div",
        { className: "modal-body" },
        h(
          "div",
          { className: "mb-3" },
          h("label", { className: "form-label" }, "Add new option"),
          h(
            "div",
            { className: "input-group" },
            h("input", {
              className: "form-control",
              type: "text",
              placeholder: "Enter option",
              value: newOption,
              onChange: (event) => setNewOption(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddOption();
                }
              },
            }),
            h(
              "button",
              {
                type: "button",
                className: "btn btn-outline-primary",
                onClick: handleAddOption,
              },
              "Add"
            )
          )
        ),
        h(
          "div",
          { className: "mb-3" },
          h("label", { className: "form-label" }, "Options"),
          h(
            "div",
            { className: "list-group" },
            options.length === 0
              ? h("div", { className: "text-muted small p-2" }, "No options added yet")
              : options.map((option, index) =>
                  h(
                    "div",
                    {
                      key: `${option}-${index}`,
                      className: "list-group-item d-flex justify-content-between align-items-center",
                    },
                    h(
                      "div",
                      { className: "d-flex align-items-center gap-2 flex-grow-1" },
                      h("input", {
                        type: "radio",
                        name: "defaultValue",
                        value: option,
                        checked: defaultValue === option,
                        onChange: () => setDefaultValue(option),
                      }),
                      h("input", {
                        type: "text",
                        className: "form-control form-control-sm",
                        value: option,
                        onChange: (e) => handleOptionChange(index, e.target.value),
                      })
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn btn-sm btn-outline-danger",
                        onClick: () => handleRemoveOption(index),
                      },
                      "Remove"
                    )
                  )
                )
          )
        )
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h(
          "button",
          { type: "button", className: "btn btn-primary", onClick: handleSave },
          "Save options"
        )
      )
    )
  );
}

app.ComboboxOptionsModal = ComboboxOptionsModal;
})(window.Notcobase, React);
