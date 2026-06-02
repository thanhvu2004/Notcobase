(function (window, antd) {
  window.Notcobase = window.Notcobase || {};

  const decorators = new Map();

  function registerDecorator(name, component, options) {
    decorators.set(name, {
      component,
      name,
      label: options?.label || name,
    });
  }

  function getDecorator(name) {
    return decorators.get(name);
  }

  function listDecorators() {
    return Array.from(decorators.values());
  }

  registerDecorator("CardItem", antd.Card, { label: "Card Item" });
  registerDecorator("Form.Item", antd.Form.Item, { label: "Form Item" });

  window.Notcobase.DecoratorRegistry = {
    getDecorator,
    listDecorators,
    registerDecorator,
  };
})(window, antd);
