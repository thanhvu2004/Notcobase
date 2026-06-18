(function (window, React, antd) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;
  const { Select, Spin } = antd;

  function parseProps(source) {
    if (!source) return {};
    if (typeof source === "object") return source;
    try {
      return JSON.parse(source);
    } catch {
      return {};
    }
  }

  async function request(path, options = {}) {
    if (window.Notcobase.ApiClient?.request) {
      return window.Notcobase.ApiClient.request(path, options);
    }

    const token = localStorage.getItem("jwtToken");
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text() || "Request failed");
    }

    return response.json();
  }

  function getValueByAlias(values, fieldName) {
    if (!values || !fieldName) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(values, fieldName)) {
      return values[fieldName];
    }

    const normalized = String(fieldName).normalize("NFC").toLowerCase();
    const match = Object.entries(values).find(([key]) => String(key).normalize("NFC").toLowerCase() === normalized);
    return match ? match[1] : undefined;
  }

  function normalizeStaticOptions(options) {
    return Array.isArray(options)
      ? options.map((option) => {
          if (typeof option === "object") {
            return option;
          }

          return {
            label: String(option),
            value: option,
          };
        })
      : [];
  }

  function getRecordColumnValue(record, columnName) {
    if (!record) {
      return undefined;
    }

    if (!columnName || String(columnName).toLowerCase() === "id") {
      return record.id;
    }

    return record.data?.[columnName];
  }

  function valuesEqual(left, right) {
    if (left === right) {
      return true;
    }

    return String(left ?? "") === String(right ?? "");
  }

  function DynamicSelect(props) {
    const config = parseProps(props.componentPropsJson || props);
    const optionMode = config.optionMode === "dynamic" ? "dynamic" : "static";
    const sourceTableId = config.sourceTableId;
    const displayColumn = config.displayColumn || "id";
    const valueColumn = config.valueColumn || "id";
    const dependsOnField = String(config.dependsOnField || "").trim();
    const filterField = String(config.filterField || "").trim();
    const runtimeValues = props.runtimeFormValues || {};
    const parentValue = dependsOnField ? getValueByAlias(runtimeValues, dependsOnField) : undefined;
    const hasDependency = Boolean(dependsOnField && filterField);
    const dependencyReady = !hasDependency || (parentValue !== undefined && parentValue !== null && parentValue !== "");
    const [dynamicOptions, setDynamicOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const staticOptions = useMemo(() => normalizeStaticOptions(config.options || props.options), [config.options, props.options]);

    useEffect(() => {
      if (optionMode !== "dynamic") {
        setDynamicOptions([]);
        setError("");
        return;
      }

      if (!sourceTableId || !dependencyReady) {
        setDynamicOptions([]);
        setError("");
        if (props.value !== undefined && props.value !== null && props.value !== "") {
          props.onChange?.(undefined);
        }
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError("");

      const query = hasDependency
        ? `?filterField=${encodeURIComponent(filterField)}&filterValue=${encodeURIComponent(parentValue)}`
        : "";

      request(`/api/tables/${sourceTableId}/records${query}`)
        .then((records) => {
          if (cancelled) {
            return;
          }

          const options = (records || [])
            .map((record) => {
              const optionValue = getRecordColumnValue(record, valueColumn);
              const labelValue = getRecordColumnValue(record, displayColumn);

              if (optionValue === undefined || optionValue === null || optionValue === "") {
                return null;
              }

              return {
                label: labelValue == null || labelValue === "" ? `#${record.id}` : String(labelValue),
                value: optionValue,
              };
            })
            .filter(Boolean);

          setDynamicOptions(options);

          if (
            props.value !== undefined &&
            props.value !== null &&
            props.value !== "" &&
            !options.some((option) => valuesEqual(option.value, props.value))
          ) {
            props.onChange?.(undefined);
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError.message || "Failed to load options");
            setDynamicOptions([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [optionMode, sourceTableId, displayColumn, valueColumn, dependsOnField, filterField, parentValue]);

    const options = optionMode === "dynamic" ? dynamicOptions : staticOptions;
    const placeholder = optionMode === "dynamic" && hasDependency && !dependencyReady
      ? (config.emptyDependencyPlaceholder || "Select a parent value first")
      : props.placeholder;
    const {
      componentPropsJson,
      runtimeFormValues,
      optionMode: ignoredOptionMode,
      sourceTableId: ignoredSourceTableId,
      displayColumn: ignoredDisplayColumn,
      valueColumn: ignoredValueColumn,
      dependsOnField: ignoredDependsOnField,
      filterField: ignoredFilterField,
      emptyDependencyPlaceholder,
      ...selectProps
    } = props;

    return h(Select, {
      ...selectProps,
      options,
      loading,
      allowClear: props.allowClear !== false,
      style: { width: "100%", ...(props.style || {}) },
      placeholder,
      notFoundContent: loading ? h(Spin, { size: "small" }) : (error || undefined),
      disabled: props.disabled || (optionMode === "dynamic" && (!sourceTableId || !dependencyReady)),
    });
  }

  window.Notcobase.DynamicSelectField = {
    DynamicSelect,
    getValueByAlias,
  };
})(window, React, antd);
