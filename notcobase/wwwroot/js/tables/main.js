(function (app, React, ReactDOM) {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("Missing #root element for Notcobase tables app");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(React.createElement(app.TablesApp));
})(window.Notcobase, React, ReactDOM);
