(function (window, React, antd) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { useMemo } = React;
  const { Alert, Empty, Form, Tabs, Typography, Collapse, Dropdown, Button } = antd;
  const {
    ComponentRegistry,
    DecoratorRegistry,
    DesignerStore,
    SchemaUtils,
    useDesignerStore,
    BlockComponents,
    BlockUtils,
  } = window.Notcobase;

  function getRequired(schema, name) {
    return Boolean(schema && name && Array.isArray(schema.required) && schema.required.includes(name));
  }

  function getOptions(schema, props) {
    const source = props.options || schema.options || schema.enum;

    if (!Array.isArray(source)) {
      return props.options;
    }

    return source.map((item) => {
      if (typeof item === "object") {
        return item;
      }

      return { label: String(item), value: item };
    });
  }

  function getFormItemValuePropName(componentName) {
    return componentName === "Switch" || componentName === "Checkbox" ? "checked" : undefined;
  }

  function mergeComponentProps(schema, context) {
    const componentName = SchemaUtils.inferComponent(schema);
    const registryItem = ComponentRegistry.getComponent(componentName);
    const props = {
      ...(registryItem?.defaultProps || {}),
      ...(schema["x-component-props"] || {}),
    };

    if (componentName === "Input" || componentName === "Input.TextArea") {
      props.placeholder = props.placeholder || schema.placeholder || (schema.title ? `Enter ${schema.title}` : undefined);
    }

    if (componentName === "InputNumber" || componentName === "DatePicker") {
      props.style = { width: "100%", ...(props.style || {}) };
    }

    if (componentName === "Select" || componentName === "Radio.Group") {
      props.options = getOptions(schema, props);
      props.placeholder = props.placeholder || schema.placeholder || (schema.title ? `Select ${schema.title}` : undefined);
    }

    if (componentName === "Select") {
      props.runtimeFormValues = context.runtimeFormValues || {};
    }

    if (componentName === "Reference") {
      props.sourceFieldName = props.sourceFieldName || schema["x-field"] || context.name;
      if (props.relationshipMode === "related" && !props.parentFieldName) {
        props.parentFieldName = props.sourceFieldName;
      }
      if (context.runtimeContext?.tableId && props.parentTableId == null) {
        props.parentTableId = context.runtimeContext.tableId;
      }
      props.runtimeContext = context.runtimeContext;
      if (context.mode === "designer") {
        props.designerMode = true;
      }
    }

    if (context.insideFormBlock && registryItem?.field) {
      delete props.defaultValue;
    }

    if (schema.disabled !== undefined) {
      props.disabled = schema.disabled;
    }

    if (schema.readOnly !== undefined) {
      props.readOnly = schema.readOnly;
    }

    props["data-schema-id"] = schema.id;
    props["data-schema-name"] = context.name;
    props["data-schema-component"] = componentName;

    return props;
  }

  function renderProperties(schema, context) {
    const insideFormBlock = SchemaUtils.isFormLikeBlock(schema) || context.insideFormBlock;
    const componentName = SchemaUtils.inferComponent(schema);
    const blockConfig = schema?.["x-component-props"] || {};
    const blockRecordId = (componentName === "FormBlock" || componentName === "DetailCard")
      ? BlockUtils.resolveRecordId(blockConfig, context.runtimeContext)
      : null;
    const childRuntimeContext = blockRecordId
      ? {
          ...(context.runtimeContext || {}),
          recordId: blockRecordId,
          parentRecordId: blockRecordId,
          tableId: blockConfig.tableId ?? context.runtimeContext?.tableId,
        }
      : context.runtimeContext;

    return SchemaUtils.sortSchemaEntries(schema.properties).map(([propertyName, propertySchema]) =>
      renderSchemaNode(propertySchema, {
        ...context,
        name: propertyName,
        parentSchema: schema,
        path: [...context.path, propertyName],
        isRoot: false,
        insideFormBlock,
        runtimeContext: childRuntimeContext,
      }),
    );
  }

  function renderTabs(schema, props, context) {
    const items = SchemaUtils.sortSchemaEntries(schema.properties).map(([key, childSchema]) => ({
      key: childSchema.id || key,
      label: childSchema.title || key,
      children: h(
        "div",
        { className: "schema-renderer-tab-panel" },
        renderSchemaNode(childSchema, {
          ...context,
          name: key,
          parentSchema: schema,
          path: [...context.path, key],
          skipDecorator: true,
          isRoot: false,
        }),
      ),
    }));

    return h(Tabs, { ...props, items });
  }

  function renderComponent(schema, context) {
    const componentName = SchemaUtils.inferComponent(schema);
    const registryItem = ComponentRegistry.getComponent(componentName);
    const Component = registryItem?.component;
    const props = {
      ...mergeComponentProps(schema, context),
      ...(context.isRoot ? context.rootProps : {}),
    };
    const childNodes = renderProperties(schema, context);

    const BlockComponent = BlockComponents?.[componentName];
    if (BlockComponent) {
      return h(BlockComponent, {
        schema,
        context,
        props,
        children: componentName === "TableBlock" ? null : childNodes,
      });
    }

    if (!Component) {
      return h(Alert, {
        type: "warning",
        showIcon: true,
        message: `Unsupported component: ${componentName}`,
      });
    }

    if (componentName === "Tabs") {
      return renderTabs(schema, props, context);
    }

    if (componentName === "Section") {
      const panelContent = childNodes.length
        ? h("div", { className: "schema-renderer-section-content" }, childNodes)
        : h(Empty, {
            description: "Drop components here",
            image: Empty.PRESENTED_IMAGE_SIMPLE,
          });

      return h(Collapse, {
        ...props,
        items: [
          {
            key: schema.id || context.name || "section",
            label: props.title || schema.title || "Section",
            children: panelContent,
          },
        ],
        defaultActiveKey: props.defaultCollapsed
          ? []
          : [schema.id || context.name || "section"],
      });
    }

    if (componentName === "Table") {
      return h(Component, {
        rowKey: props.rowKey || "id",
        pagination: false,
        size: "small",
        ...props,
      });
    }

    if (componentName === "Title") {
      return h(Component, { level: props.level || 3, ...props }, props.children || schema.title);
    }

    if (componentName === "Text") {
      return h(Component, props, props.children || schema.title || schema.description);
    }

    if (componentName === "Divider") {
      return h(Component, props, props.children || schema.title);
    }

    if (componentName === "Button" || componentName === "Action") {
      const buttonProps = { ...props };
      const navigationConfig = {
        action: buttonProps.action,
        targetPageId: buttonProps.targetPageId,
        targetUrl: buttonProps.targetUrl,
        navigatePageId: buttonProps.navigatePageId,
        params: buttonProps.params,
        navigationParams: buttonProps.navigationParams,
      };
      delete buttonProps.action;
      delete buttonProps.targetPageId;
      delete buttonProps.targetUrl;
      delete buttonProps.navigatePageId;
      delete buttonProps.params;
      delete buttonProps.navigationParams;
      if (context.insideFormBlock && buttonProps.htmlType === "submit") {
        buttonProps.htmlType = "button";
      }
      if (navigationConfig.action === "navigate") {
        const originalOnClick = buttonProps.onClick;
        buttonProps.onClick = (event) => {
          originalOnClick?.(event);
          if (event?.defaultPrevented || context.mode === "designer") {
            return;
          }
          const navigated = BlockUtils.navigate(navigationConfig, {
            ...(context.runtimeContext || {}),
            ...(context.runtimeFormValues || {}),
          });
          if (!navigated) {
            antd.message?.warning?.("Select a target page first");
          }
        };
      }
      return h(Component, buttonProps, buttonProps.children || schema.title || "Action");
    }

    if (componentName === "Form") {
      return h(Component, props, childNodes);
    }

    if (componentName === "Select" && props.optionMode === "dynamic" && window.Notcobase.DynamicSelectField?.DynamicSelect) {
      return h(window.Notcobase.DynamicSelectField.DynamicSelect, props);
    }

    if (SchemaUtils.isContainerNode(schema) || childNodes.length > 0) {
      return h(Component, props, childNodes.length ? childNodes : h(Empty, { description: "Drop components here", image: Empty.PRESENTED_IMAGE_SIMPLE }));
    }

    return h(Component, props);
  }

  function renderWithDecorator(schema, node, context) {
    const componentName = SchemaUtils.inferComponent(schema);
    const registryItem = ComponentRegistry.getComponent(componentName);

    if (!schema["x-decorator"] && context.name && context.insideFormBlock && registryItem?.field) {
      return h(
        Form.Item,
        {
          key: context.path.join("."),
          name: context.name,
          label: schema.title || context.name,
          tooltip: schema.description,
          required: getRequired(context.parentSchema, context.name) || schema.required === true,
          rules: schema["x-rules"] || [
            {
              required: getRequired(context.parentSchema, context.name) || schema.required === true,
              message: `${schema.title || context.name} is required`,
            },
          ],
          ...(getFormItemValuePropName(componentName) ? { valuePropName: getFormItemValuePropName(componentName) } : {}),
        },
        node,
      );
    }

    const decoratorName = schema["x-decorator"];
    const decoratorProps = { ...(schema["x-decorator-props"] || {}) };

    if (!decoratorName) {
      return node;
    }

    const Decorator = DecoratorRegistry.getDecorator(decoratorName)?.component;
    if (!Decorator) {
      return node;
    }

    const props = {
      key: context.path.join("."),
      ...decoratorProps,
    };

    if (decoratorName === "Form.Item") {
      props.name = props.name || context.name;
      props.label = props.label || schema.title || context.name;
      props.tooltip = props.tooltip || schema.description;
      props.required = props.required ?? (getRequired(context.parentSchema, context.name) || schema.required === true);
      const valuePropName = getFormItemValuePropName(componentName);
      if (!props.valuePropName && valuePropName) {
        props.valuePropName = valuePropName;
      }
    } else if (decoratorName === "CardItem") {
      props.title = props.title || schema.title;
      props.size = props.size || "small";
    }

    return h(Decorator, props, node);
  }

  function DesignerNodeFrame({ schema, context, children }) {
    const selectedNodeId = useDesignerStore((state) => state.selectedNodeId);
    const hoveredNodeId = useDesignerStore((state) => state.hoveredNodeId);
    const isSelected = selectedNodeId === schema.id;
    const isHovered = hoveredNodeId === schema.id;
    const canDelete = !context.isRoot && Boolean(context.onDeleteNode);
    const showDelete = canDelete && (isHovered || isSelected);
    const className = [
      "schema-designer-node",
      isSelected ? "is-selected" : "",
      isHovered ? "is-hovered" : "",
      SchemaUtils.isContainerNode(schema) ? "is-container" : "",
    ].filter(Boolean).join(" ");

    const componentName = SchemaUtils.inferComponent(schema);
    const isContainer = SchemaUtils.isContainerNode(schema) || componentName === "Container";
    const componentItems = ComponentRegistry.getComponentItems();

    function handleSelect(event) {
      event.stopPropagation();
      DesignerStore.getState().setSelectedNodeId(schema.id);
    }

    function handleDelete(event) {
      event.stopPropagation();
      event.preventDefault();
      context.onDeleteNode?.(schema.id);
      DesignerStore.getState().clearInteractionState();
    }

    function handleDragStart(event) {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/schema-node-id", schema.id);
      DesignerStore.getState().setDraggingNodeId(schema.id);
    }

    function handleDrag(event) {
      const edgeThreshold = 80;
      const scrollSpeed = 20;

      if (event.clientY < edgeThreshold) {
        window.scrollBy(0, -scrollSpeed);
      } else if (event.clientY > window.innerHeight - edgeThreshold) {
        window.scrollBy(0, scrollSpeed);
      }
    }

    function handleDragEnd() {
      DesignerStore.getState().setDraggingNodeId(null);
    }

    function handleDrop(event) {
      const sourceId = event.dataTransfer.getData("text/schema-node-id");
      if (!sourceId || sourceId === schema.id) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      context.onMoveNode?.({
        sourceId,
        targetId: schema.id,
        placement: SchemaUtils.isContainerNode(schema) ? "inside" : "after",
      });
      // DesignerStore.getState().setDraggingNodeId(null);
    }

    function handleAddComponent(key, { domEvent }) {
      domEvent.stopPropagation();
      context.onAddComponent?.(key, schema.id);
    }

    return h(
      "div",
      {
        className,
        draggable: !context.isRoot,
        "data-schema-frame-id": schema.id,
        onClick: handleSelect,
        onMouseEnter: (event) => {
          event.stopPropagation();
          DesignerStore.getState().setHoveredNodeId(schema.id);
        },
        onMouseLeave: () => DesignerStore.getState().setHoveredNodeId(null),
        onDragStart: handleDragStart,
        onDrag: handleDrag,
        onDragEnd: handleDragEnd,
        onDragOver: (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        },
        onDrop: handleDrop,
      },
      h(
        "div",
        { className: "schema-designer-node-header" },
        h("span", { className: "schema-designer-node-label" }, schema.title || context.name || SchemaUtils.inferComponent(schema)),
        showDelete &&
          h(
            "button",
            {
              type: "button",
              className: "schema-designer-node-delete",
              title: "Remove component",
              "aria-label": "Remove component",
              onClick: handleDelete,
              onMouseDown: (event) => event.stopPropagation(),
            },
            "×",
          ),
      ),
      children,
      (mode => mode)(isContainer) &&
        h(
          "div",
          {
            className: "schema-designer-inline-add",
            onClick: (event) => event.stopPropagation(),
          },
          h(
            Dropdown,
            {
              menu: {
                items: componentItems,
                onClick: ({ key, domEvent }) => handleAddComponent(key, { domEvent }),
              },
              trigger: ["click"],
            },
            h(
              Button,
              {
                block: true,
                type: "dashed",
                className: "schema-designer-inline-add-button",
              },
              "+ Add Component"
            )
          )
        ),
    );
  }

  function renderSchemaNode(schema, context) {
    if (
      !schema
      || schema["x-hidden"]
      || schema?.["x-component-props"]?.hiddenInForms === true
      || schema?.["x-component-props"]?.type === "parent-link"
    ) {
      return null;
    }

    const visibleRule = schema?.["x-component-props"]?.visibleWhen;

    if (visibleRule && context.mode !== "designer") {
      const currentValues = BlockUtils.addFieldValueAliases(
        context.rootSchema || schema,
        context.runtimeFormValues ??
          (typeof context.form?.getFieldsValue === "function"
            ? context.form.getFieldsValue(true)
            : {}),
      );

      if (!BlockUtils.evaluateVisibleWhen(visibleRule, currentValues)) {
        return null;
      }
    }

    const node = renderWithDecorator(schema, renderComponent(schema, context), context);

    if (context.mode !== "designer") {
      return node;
    }

    return h(DesignerNodeFrame, { key: schema.id, schema, context }, node);
  }

  function extractInitialValues(schema, acc = {}) {
    if (!schema) return acc;

    const name = schema.name;
    const fieldName = schema["x-field"];
    const defaultValue = schema?.["x-component-props"]?.defaultValue;

    const componentName = SchemaUtils.inferComponent(schema);
    const registryItem = ComponentRegistry.getComponent(componentName);

    if (
      name &&
      defaultValue !== undefined &&
      registryItem?.field
    ) {
      acc[name] = defaultValue;
      if (fieldName && acc[fieldName] === undefined) {
        acc[fieldName] = defaultValue;
      }
    }

    if (schema.properties && typeof schema.properties === "object") {
      Object.entries(schema.properties).forEach(([key, child]) => {
        extractInitialValues(child, acc);
      });
    }

    return acc;
  }

  function SchemaRenderer({ schema, initialValues, mode, runtimeContext, onNodeSelect, onMoveNode, onDeleteNode, onAddComponent, onRecordSaved, onRecordDeleted, onSubmit, onValuesChange, formProps }) {
    const [form] = Form.useForm();
    const [, forceRender] = React.useState(0);
    const runtimeFormValuesRef = React.useRef({});
    const formGroupsRef = React.useRef(new Map());
    const loadedFormGroupRecordsRef = React.useRef(new Set());
    const refreshVisibility = (values) => {
      if (values && typeof values === "object") {
        runtimeFormValuesRef.current = values;
      }

      forceRender((value) => value + 1);
    };
    const normalizedSchema = useMemo(() => SchemaUtils.ensureNodeIds(schema || {}), [schema]);

    React.useEffect(() => {
      const selectedNodeId = DesignerStore.getState().selectedNodeId;
      if (mode === "designer" && selectedNodeId && onNodeSelect) {
        onNodeSelect(selectedNodeId);
      }
    }, [mode, onNodeSelect]);

    if (!normalizedSchema || Object.keys(normalizedSchema).length === 0) {
      return h(Empty, { description: "No schema metadata" });
    }

    const rootComponent = SchemaUtils.inferComponent(normalizedSchema);

    const computedInitialValues = useMemo(() => {
      const values = {
        ...extractInitialValues(normalizedSchema),
        ...initialValues,
      };
      return BlockUtils.addFieldValueAliases(normalizedSchema, values);
    }, [initialValues, normalizedSchema]);

    const hasInitializedRef = React.useRef(false);

    React.useEffect(() => {
      if (!form) return;
      if (!normalizedSchema) return;
      if (hasInitializedRef.current) return;

      form.setFieldsValue(computedInitialValues);
      runtimeFormValuesRef.current = computedInitialValues;
      hasInitializedRef.current = true;
    }, [form, computedInitialValues, normalizedSchema]);

    const rootProps = {
      layout: "vertical",
      initialValues: computedInitialValues,
      onValuesChange: (...args) => {
        const allValues = args[1] || (typeof form?.getFieldsValue === "function" ? form.getFieldsValue(true) : {});
        runtimeFormValuesRef.current = BlockUtils.addFieldValueAliases(normalizedSchema, allValues);
        forceRender((value) => value + 1);
        onValuesChange?.(...args);
      },
      ...normalizedSchema["x-component-props"],
      ...formProps,
    };
    if (rootComponent === "Form") {
      rootProps.form = form;
      rootProps.onFinish = onSubmit;
    }

    return h(
      "div",
      { className: mode === "designer" ? "schema-renderer schema-renderer-designer" : "schema-renderer" },
      renderSchemaNode(normalizedSchema, {
        name: normalizedSchema.name || "root",
        parentSchema: null,
        path: [normalizedSchema.name || "root"],
        form,
        rootSchema: normalizedSchema,
        rootProps,
        runtimeFormValues: runtimeFormValuesRef.current,
        formGroups: formGroupsRef.current,
        loadedFormGroupRecords: loadedFormGroupRecordsRef.current,
        refreshVisibility,
        mode: mode || "runtime",
        runtimeContext,
        onMoveNode,
        onDeleteNode,
        onAddComponent,
        onRecordSaved,
        onRecordDeleted,
        isRoot: true,
        skipDecorator: true,
      }),
    );
  }

  window.Notcobase.SchemaRenderer = SchemaRenderer;
  window.Notcobase.SchemaRendererInternals = {
    getRequired,
    mergeComponentProps,
    renderSchemaNode,
  };
})(window, React, antd);
