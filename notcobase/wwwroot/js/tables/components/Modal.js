(function (app, React) {
  const h = React.createElement;

  function Modal({ title, onClose, children }) {
    return h(
      "div",
      {
        className: "modal show d-block",
        tabIndex: "-1",
        style: { backgroundColor: "rgba(0,0,0,0.5)" },
      },
      h(
        "div",
        { className: "modal-dialog" },
        h(
          "div",
          { className: "modal-content" },
          h(
            "div",
            { className: "modal-header" },
            h("h5", { className: "modal-title" }, title),
            h("button", { type: "button", className: "btn-close", onClick: onClose }),
          ),
          children,
        ),
      ),
    );
  }

  app.Modal = Modal;
})(window.Notcobase, React);
