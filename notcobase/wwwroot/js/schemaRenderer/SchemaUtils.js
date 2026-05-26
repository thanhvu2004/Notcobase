(function (window) {
  window.Notcobase = window.Notcobase || {};

  function createNodeId(prefix) {
    const safePrefix = prefix || "node";
    if (window.crypto?.randomUUID) {
      return `${safePrefix}-${window.crypto.randomUUID()}`;
    }

    return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function cloneSchema(schema) {
    return JSON.parse(JSON.stringify(schema || {}));
  }

  function sortSchemaEntries(properties) {
    return Object.entries(properties || {}).sort(([, left], [, right]) => {
      const leftIndex = left["x-index"] ?? left.order ?? 0;
      const rightIndex = right["x-index"] ?? right.order ?? 0;
      return leftIndex - rightIndex;
    });
  }

  function ensureNodeIds(schema) {
    const nextSchema = cloneSchema(schema);

    function visit(node, name) {
      if (!node || typeof node !== "object") {
        return;
      }

      if (!node.id) {
        node.id = createNodeId(name || "node");
      }

      sortSchemaEntries(node.properties).forEach(([propertyName, childNode], index) => {
        if (childNode["x-index"] === undefined) {
          childNode["x-index"] = index;
        }

        visit(childNode, propertyName);
      });
    }

    visit(nextSchema, nextSchema.name || "root");
    return nextSchema;
  }

  function inferComponent(schema) {
    if (schema?.["x-component"]) {
      return schema["x-component"];
    }

    if (schema?.enum || schema?.options) {
      return "Select";
    }

    if (schema?.type === "boolean") {
      return "Switch";
    }

    if (schema?.type === "number" || schema?.type === "integer") {
      return "InputNumber";
    }

    if (schema?.format === "date" || schema?.format === "date-time") {
      return "DatePicker";
    }

    if (schema?.type === "object") {
      return "Card";
    }

    return "Input";
  }

  function isContainerNode(schema) {
    return ["Card", "Form", "Grid.Col", "Grid.Row", "Space", "Tabs"].includes(inferComponent(schema));
  }

  function findNode(schema, nodeId) {
    if (!schema || !nodeId) {
      return null;
    }

    if (schema.id === nodeId) {
      return {
        node: schema,
        parent: null,
        key: schema.name || "root",
        path: [schema.name || "root"],
      };
    }

    let result = null;

    function visit(node, parent, key, path) {
      if (!node || result) {
        return;
      }

      if (node.id === nodeId) {
        result = { node, parent, key, path };
        return;
      }

      sortSchemaEntries(node.properties).forEach(([childKey, childNode]) => {
        visit(childNode, node, childKey, [...path, childKey]);
      });
    }

    sortSchemaEntries(schema.properties).forEach(([key, node]) => visit(node, schema, key, [schema.name || "root", key]));
    return result;
  }

  function updateNode(schema, nodeId, updater) {
    const nextSchema = cloneSchema(schema);
    const match = findNode(nextSchema, nodeId);

    if (!match) {
      return nextSchema;
    }

    const replacement = updater(cloneSchema(match.node), match);

    if (!match.parent) {
      return replacement;
    }

    match.parent.properties = match.parent.properties || {};
    match.parent.properties[match.key] = replacement;
    return nextSchema;
  }

  function removeNode(schema, nodeId) {
    const nextSchema = cloneSchema(schema);
    const match = findNode(nextSchema, nodeId);

    if (!match?.parent) {
      return { schema: nextSchema, removed: null };
    }

    const removed = match.parent.properties?.[match.key] || null;
    delete match.parent.properties[match.key];
    normalizeIndexes(match.parent);
    return { schema: nextSchema, removed };
  }

  function normalizeIndexes(parentNode) {
    sortSchemaEntries(parentNode.properties).forEach(([key, childNode], index) => {
      childNode["x-index"] = index;
      parentNode.properties[key] = childNode;
    });
  }

  function insertNode(schema, parentId, node, options) {
    const nextSchema = cloneSchema(schema);
    const parentMatch = findNode(nextSchema, parentId);
    const insertOptions = options || {};

    if (!parentMatch) {
      return nextSchema;
    }

    const parentNode = parentMatch.node;
    parentNode.properties = parentNode.properties || {};

    const nodeKey = insertOptions.key || node.name || `node_${Object.keys(parentNode.properties).length + 1}`;
    const entries = sortSchemaEntries(parentNode.properties).filter(([key]) => key !== nodeKey);
    const insertIndex = Math.max(0, Math.min(insertOptions.index ?? entries.length, entries.length));
    entries.splice(insertIndex, 0, [
      nodeKey,
      {
        ...cloneSchema(node),
        id: node.id || createNodeId(nodeKey),
      },
    ]);

    parentNode.properties = entries.reduce((properties, [key, childNode], index) => {
      properties[key] = {
        ...childNode,
        "x-index": index,
      };
      return properties;
    }, {});

    if (!parentNode.properties[nodeKey]) {
      parentNode.properties[nodeKey] = {
      ...cloneSchema(node),
      id: node.id || createNodeId(nodeKey),
      "x-index": insertIndex,
      };
    }

    return nextSchema;
  }

  function moveNode(schema, sourceId, targetId, placement) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return schema;
    }

    const sourceMatch = findNode(schema, sourceId);
    const targetMatch = findNode(schema, targetId);

    if (!sourceMatch?.parent || !targetMatch) {
      return schema;
    }

    const sourceParentId = sourceMatch.parent.id;
    const targetParentId = placement === "inside" && isContainerNode(targetMatch.node)
      ? targetMatch.node.id
      : targetMatch.parent?.id;

    if (!targetParentId) {
      return schema;
    }

    const removedResult = removeNode(schema, sourceId);
    const withoutSource = removedResult.schema;
    const targetParentMatch = findNode(withoutSource, targetParentId);

    if (!targetParentMatch || !removedResult.removed) {
      return schema;
    }

    const targetAfterRemove = findNode(withoutSource, targetId);
    let targetIndex = Object.keys(targetParentMatch.node.properties || {}).length;

    if (targetAfterRemove?.parent?.id === targetParentMatch.node.id) {
      targetIndex = sortSchemaEntries(targetParentMatch.node.properties).findIndex(([, child]) => child.id === targetId);
      if (placement === "after") {
        targetIndex += 1;
      }
    }

    return insertNode(withoutSource, targetParentMatch.node.id, removedResult.removed, {
      key: sourceMatch.key,
      index: targetIndex,
    });
  }

  function setRequired(schema, nodeId, required) {
    const match = findNode(schema, nodeId);
    if (!match?.parent || !match.key) {
      return schema;
    }

    const parentId = match.parent.id;
    return updateNode(schema, parentId, (parentNode) => {
      const requiredList = Array.isArray(parentNode.required) ? parentNode.required.filter((item) => item !== match.key) : [];
      if (required) {
        requiredList.push(match.key);
      }

      if (requiredList.length) {
        parentNode.required = requiredList;
      } else {
        delete parentNode.required;
      }

      return parentNode;
    });
  }

  function createDefaultNode(componentName) {
    const fieldComponents = ["Input", "Input.TextArea", "InputNumber", "Select", "DatePicker", "Switch", "Checkbox"];
    const key = `${componentName || "component"}_${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9_]/g, "_");

    return {
      id: createNodeId(key),
      type: fieldComponents.includes(componentName) ? "string" : "void",
      title: componentName || "Component",
      "x-component": componentName || "Input",
      "x-component-props": {},
      name: key,
      properties: isContainerNode({ "x-component": componentName }) ? {} : undefined,
    };
  }

  window.Notcobase.SchemaUtils = {
    cloneSchema,
    createDefaultNode,
    createNodeId,
    ensureNodeIds,
    findNode,
    inferComponent,
    insertNode,
    isContainerNode,
    moveNode,
    removeNode,
    setRequired,
    sortSchemaEntries,
    updateNode,
  };
})(window);
