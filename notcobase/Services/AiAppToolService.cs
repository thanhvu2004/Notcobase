using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Services;

public class AiAppToolService
{
    private static readonly HashSet<string> ComponentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Container", "Section", "Grid.Row", "Grid.Col", "Tabs", "Divider", "Heading", "Text", "Button",
        "Input", "InputNumber", "Input.TextArea", "Textarea", "Select", "Checkbox", "Switch", "DatePicker",
        "File", "Reference", "FormBlock", "TableBlock"
    };

    private readonly AppDbContext _context;
    private readonly DynamicTableService _dynamicTableService;
    private readonly SchemaMetadataSyncService _schemaMetadataSyncService;
    private readonly ILogger<AiAppToolService> _logger;

    public AiAppToolService(
        AppDbContext context,
        DynamicTableService dynamicTableService,
        SchemaMetadataSyncService schemaMetadataSyncService,
        ILogger<AiAppToolService> logger)
    {
        _context = context;
        _dynamicTableService = dynamicTableService;
        _schemaMetadataSyncService = schemaMetadataSyncService;
        _logger = logger;
    }

    public IReadOnlyList<object> GetToolDefinitions(ClaimsPrincipal user)
    {
        var tools = new List<object>();
        if (Can(user, "tables.create"))
        {
            tools.Add(BuildTool("create_table", "Create a Notcobase table metadata record.", new
            {
                type = "object",
                properties = new
                {
                    name = new { type = "string", description = "Table name." },
                    description = new { type = "string", description = "Optional table description." },
                    inheritProperties = new { type = "boolean", description = "Whether this table inherits from a parent table." },
                    parentTableId = new { type = "integer", description = "Parent table ID when inheritance is enabled." }
                },
                required = new[] { "name" },
                additionalProperties = false
            }));
        }

        if (Can(user, "columns.create"))
        {
            tools.Add(BuildTool("create_column", "Create a field/column on an existing Notcobase table.", new
            {
                type = "object",
                properties = new
                {
                    tableId = new { type = "integer", description = "Target table ID." },
                    name = new { type = "string", description = "Column name." },
                    fieldType = new { type = "string", description = "Field type: text, number, date, checkbox, combobox, reference, etc." },
                    isRequired = new { type = "boolean", description = "Whether the column is required." },
                    componentProps = new { type = "object", description = "Optional component configuration JSON object." }
                },
                required = new[] { "tableId", "name", "fieldType" },
                additionalProperties = false
            }));
        }

        if (Can(user, "pages.editor"))
        {
            tools.Add(BuildTool("create_page", "Create a low-code page.", new
            {
                type = "object",
                properties = new
                {
                    name = new { type = "string", description = "Page name." },
                    sectionName = new { type = "string", description = "Optional navigation section." },
                    requiredPermission = new { type = "string", description = "Optional permission required to view the page." },
                    showInNavbar = new { type = "boolean", description = "Whether to show the page in navigation." },
                    isPublished = new { type = "boolean", description = "Whether the page is published." }
                },
                required = new[] { "name" },
                additionalProperties = false
            }));

            tools.Add(BuildTool("add_component_to_page", "Insert a component into an existing low-code page schema. When the user names a page, pass that value as pageName instead of asking for a page ID.", new
            {
                type = "object",
                properties = new
                {
                    pageId = new { type = "integer", description = "Optional page ID. Do not ask for this if the user gave a page name." },
                    pageName = new { type = "string", description = "Optional page name or slug. Use the user's provided page name or slug here." },
                    component = new { type = "string", description = "Component name, for example Text, Heading, FormBlock, TableBlock, Grid.Row." },
                    parentNodeId = new { type = "string", description = "Optional parent schema node ID. Omit to insert at the root page container." },
                    parentComponent = new { type = "string", description = "Optional parent component reference, such as FormBlock, form block, a parent node name, or a parent title. Use this when the user says to add something inside a component but does not provide a node ID." },
                    title = new { type = "string", description = "Optional title for the component." },
                    props = new { type = "object", description = "Optional x-component-props values, such as text, tableId, columns, formColumns, pageSize." }
                },
                required = new[] { "component" },
                additionalProperties = false
            }));

            tools.Add(BuildTool("configure_page_component", "Update an existing component on a low-code page. Use this to configure a FormBlock or TableBlock, for example setting a FormBlock to use a table by tableName.", new
            {
                type = "object",
                properties = new
                {
                    pageId = new { type = "integer", description = "Optional page ID. Do not ask for this if the user gave a page name." },
                    pageName = new { type = "string", description = "Optional page name or slug. Use the user's provided page name or slug here." },
                    targetNodeId = new { type = "string", description = "Optional exact node ID of the component to update." },
                    targetComponent = new { type = "string", description = "Optional component reference to update, such as FormBlock, TableBlock, form block, a node name, or a node title." },
                    component = new { type = "string", description = "Alias for targetComponent when the user names the component to configure." },
                    tableId = new { type = "integer", description = "Optional table ID to assign to the component." },
                    tableName = new { type = "string", description = "Optional table name to assign to the component. Use this when the user gives a table name." },
                    includeAllTableColumns = new { type = "boolean", description = "For FormBlock or TableBlock, whether to populate the component with all visible columns from the table. Defaults to true when tableName or tableId is provided." },
                    props = new { type = "object", description = "Optional x-component-props values to merge into the component." }
                },
                required = Array.Empty<string>(),
                additionalProperties = false
            }));
        }

        return tools;
    }

    public async Task<AiToolExecution> ExecuteAsync(string toolName, string argumentsJson, ClaimsPrincipal user)
    {
        try
        {
            var args = ParseArguments(argumentsJson);
            return toolName switch
            {
                "create_table" => await CreateTableAsync(args, user),
                "create_column" => await CreateColumnAsync(args, user),
                "create_page" => await CreatePageAsync(args, user),
                "add_component_to_page" => await AddComponentToPageAsync(args, user),
                "configure_page_component" => await ConfigurePageComponentAsync(args, user),
                _ => new AiToolExecution(toolName, false, $"Unknown tool '{toolName}'.", null)
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI tool {ToolName} failed", toolName);
            return new AiToolExecution(toolName, false, ex.Message, null);
        }
    }

    private async Task<AiToolExecution> CreateTableAsync(JsonObject args, ClaimsPrincipal user)
    {
        Require(user, "tables.create");
        var name = GetRequiredString(args, "name");
        var inheritProperties = GetBool(args, "inheritProperties") ?? false;
        var parentTableId = GetInt(args, "parentTableId");

        if (inheritProperties && !parentTableId.HasValue)
            throw new InvalidOperationException("Parent table is required when inheritance is enabled.");

        if (parentTableId.HasValue && !await _context.Tables.AnyAsync(t => t.Id == parentTableId.Value))
            throw new InvalidOperationException("Parent table not found.");

        var table = new Table
        {
            Name = name,
            Description = GetString(args, "description"),
            InheritProperties = inheritProperties,
            ParentTableId = inheritProperties ? parentTableId : null
        };

        _context.Tables.Add(table);
        await _context.SaveChangesAsync();

        return new AiToolExecution("create_table", true, $"Created table '{table.Name}'.", new
        {
            table.Id,
            table.Name,
            table.Description,
            table.InheritProperties,
            table.ParentTableId
        });
    }

    private async Task<AiToolExecution> CreateColumnAsync(JsonObject args, ClaimsPrincipal user)
    {
        Require(user, "columns.create");
        var tableId = GetRequiredInt(args, "tableId");
        var table = await _context.Tables
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);
        if (table == null)
            throw new InvalidOperationException("Table not found.");

        var name = GetRequiredString(args, "name");
        var fieldType = GetRequiredString(args, "fieldType");
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        if (GetEffectiveColumns(table, tableMap)
            .Any(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("A column with this name already exists on this table or an inherited parent table.");
        }

        var column = new Column
        {
            Name = name,
            FieldType = fieldType,
            TableId = tableId,
            IsRequired = GetBool(args, "isRequired") ?? false,
            SortOrder = await GetNextSortOrderAsync(tableId),
            ComponentPropsJson = GetObjectJson(args, "componentProps") ?? "{}"
        };

        _context.Columns.Add(column);
        await _context.SaveChangesAsync();

        if (!table.PhysicalTableCreated && await _context.Columns.CountAsync(c => c.TableId == tableId) == 1)
        {
            await _dynamicTableService.CreatePhysicalTableAsync(tableId);
        }

        await _dynamicTableService.AddColumnToTableAndDescendantsAsync(column);
        await _schemaMetadataSyncService.SyncTableAsync(tableId);

        return new AiToolExecution("create_column", true, $"Created column '{column.Name}' on table ID {tableId}.", new
        {
            column.Id,
            column.Name,
            column.FieldType,
            column.TableId,
            column.IsRequired,
            column.SortOrder,
            column.ComponentPropsJson
        });
    }

    private async Task<AiToolExecution> CreatePageAsync(JsonObject args, ClaimsPrincipal user)
    {
        Require(user, "pages.editor");
        var name = GetRequiredString(args, "name");
        var page = new LowCodePage
        {
            Name = name,
            Slug = await BuildUniqueSlug(name),
            SectionName = NormalizeNullable(GetString(args, "sectionName")),
            RequiredPermission = NormalizeNullable(GetString(args, "requiredPermission")),
            ShowInNavbar = GetBool(args, "showInNavbar") ?? true,
            IsPublished = GetBool(args, "isPublished") ?? true,
            SchemaJson = CreateDefaultPageSchemaJson(name)
        };

        _context.LowCodePages.Add(page);
        await _context.SaveChangesAsync();

        return new AiToolExecution("create_page", true, $"Created page '{page.Name}'.", new
        {
            page.Id,
            page.Name,
            page.Slug,
            page.SectionName,
            page.RequiredPermission,
            page.ShowInNavbar,
            page.IsPublished
        });
    }

    private async Task<AiToolExecution> AddComponentToPageAsync(JsonObject args, ClaimsPrincipal user)
    {
        Require(user, "pages.editor");
        var component = GetRequiredString(args, "component");
        if (!ComponentTypes.Contains(component))
            throw new InvalidOperationException($"Unsupported component '{component}'.");

        var page = await FindPageAsync(GetInt(args, "pageId"), GetPageName(args));

        var schema = JsonNode.Parse(page.SchemaJson)?.AsObject()
            ?? throw new InvalidOperationException("Page schema is invalid.");
        var parentReference = GetParentReference(args);
        var node = CreateComponentNode(component, GetString(args, "title"), args["props"] as JsonObject);

        var inserted = string.IsNullOrWhiteSpace(parentReference)
            ? InsertNode(schema, node)
            : InsertNodeByReference(schema, parentReference!, node);
        if (!inserted)
            throw new InvalidOperationException("Parent node not found or cannot contain child components.");

        page.SchemaJson = schema.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
        page.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return new AiToolExecution("add_component_to_page", true, $"Added {component} to page '{page.Name}'.", new
        {
            page.Id,
            page.Name,
            component,
            nodeId = node["id"]?.GetValue<string>(),
            nodeName = node["name"]?.GetValue<string>()
        });
    }

    private async Task<AiToolExecution> ConfigurePageComponentAsync(JsonObject args, ClaimsPrincipal user)
    {
        Require(user, "pages.editor");
        var page = await FindPageAsync(GetInt(args, "pageId"), GetPageName(args));
        var schema = JsonNode.Parse(page.SchemaJson)?.AsObject()
            ?? throw new InvalidOperationException("Page schema is invalid.");
        var targetReference = GetTargetReference(args);
        if (string.IsNullOrWhiteSpace(targetReference))
            throw new InvalidOperationException("targetNodeId or targetComponent is required.");

        var target = FindSingleNodeByReference(schema, targetReference!);
        var component = GetNodeString(target["x-component"]) ?? "component";
        var targetProps = target["x-component-props"] as JsonObject;
        if (targetProps == null)
        {
            targetProps = new JsonObject();
            target["x-component-props"] = targetProps;
        }

        MergePropsInto(targetProps, args["props"] as JsonObject);

        var tableId = GetInt(args, "tableId");
        var tableName = GetString(args, "tableName");
        Table? table = null;
        if (tableId.HasValue || !string.IsNullOrWhiteSpace(tableName))
        {
            table = await FindTableAsync(tableId, tableName);
            targetProps["tableId"] = table.Id;

            var includeAllColumns = GetBool(args, "includeAllTableColumns") ?? true;
            if (includeAllColumns)
            {
                var columns = await _context.Columns
                    .Where(c => c.TableId == table.Id)
                    .OrderBy(c => c.SortOrder)
                    .ThenBy(c => c.Id)
                    .ToListAsync();
                ApplyTableColumns(target, component, columns);
            }
        }

        page.SchemaJson = schema.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
        page.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return new AiToolExecution("configure_page_component", true, $"Configured {component} on page '{page.Name}'.", new
        {
            page.Id,
            page.Name,
            component,
            nodeId = target["id"]?.GetValue<string>(),
            nodeName = target["name"]?.GetValue<string>(),
            tableId = table?.Id,
            tableName = table?.Name
        });
    }

    private async Task<LowCodePage> FindPageAsync(int? pageId, string? pageName)
    {
        if (pageId.HasValue)
        {
            return await _context.LowCodePages.FirstOrDefaultAsync(p => p.Id == pageId.Value)
                ?? throw new InvalidOperationException($"Page with ID {pageId.Value} was not found.");
        }

        var normalizedPageName = NormalizeNullable(pageName);
        if (normalizedPageName == null)
            throw new InvalidOperationException("Provide pageId or pageName so I can find the page.");

        var lowered = normalizedPageName.ToLowerInvariant();
        var slug = BuildSlug(normalizedPageName);

        var exactMatches = await _context.LowCodePages
            .Where(p => p.Name.ToLower() == lowered || (p.Slug != null && p.Slug.ToLower() == lowered) || (p.Slug != null && p.Slug.ToLower() == slug))
            .ToListAsync();

        if (exactMatches.Count == 1)
            return exactMatches[0];

        if (exactMatches.Count > 1)
            throw new InvalidOperationException($"Multiple pages match '{normalizedPageName}'. Please use a more specific page name.");

        var partialMatches = await _context.LowCodePages
            .Where(p => p.Name.ToLower().Contains(lowered) || (p.Slug != null && p.Slug.ToLower().Contains(lowered)))
            .OrderBy(p => p.Name)
            .Take(5)
            .ToListAsync();

        if (partialMatches.Count == 1)
            return partialMatches[0];

        if (partialMatches.Count > 1)
        {
            var names = string.Join(", ", partialMatches.Select(p => $"'{p.Name}'"));
            throw new InvalidOperationException($"Multiple pages match '{normalizedPageName}': {names}. Please use a more specific page name.");
        }

        throw new InvalidOperationException($"Page '{normalizedPageName}' was not found.");
    }

    private async Task<Table> FindTableAsync(int? tableId, string? tableName)
    {
        if (tableId.HasValue)
        {
            return await _context.Tables.FirstOrDefaultAsync(t => t.Id == tableId.Value)
                ?? throw new InvalidOperationException($"Table with ID {tableId.Value} was not found.");
        }

        var normalizedTableName = NormalizeNullable(tableName);
        if (normalizedTableName == null)
            throw new InvalidOperationException("Provide tableId or tableName so I can find the table.");

        var lowered = normalizedTableName.ToLowerInvariant();
        var exactMatches = await _context.Tables
            .Where(t => t.Name.ToLower() == lowered)
            .ToListAsync();

        if (exactMatches.Count == 1)
            return exactMatches[0];

        if (exactMatches.Count > 1)
            throw new InvalidOperationException($"Multiple tables match '{normalizedTableName}'. Please use a table ID.");

        var partialMatches = await _context.Tables
            .Where(t => t.Name.ToLower().Contains(lowered))
            .OrderBy(t => t.Name)
            .Take(5)
            .ToListAsync();

        if (partialMatches.Count == 1)
            return partialMatches[0];

        if (partialMatches.Count > 1)
        {
            var names = string.Join(", ", partialMatches.Select(t => $"'{t.Name}'"));
            throw new InvalidOperationException($"Multiple tables match '{normalizedTableName}': {names}. Please use a more specific table name.");
        }

        throw new InvalidOperationException($"Table '{normalizedTableName}' was not found.");
    }

    private static string? GetPageName(JsonObject args)
    {
        return GetFirstString(args, "pageName", "page", "pageTitle", "pageSlug");
    }

    private static string? GetParentReference(JsonObject args)
    {
        return GetFirstString(args, "parentNodeId", "parentComponent", "parentComponentType", "parentName", "parentTitle", "parent");
    }

    private static string? GetTargetReference(JsonObject args)
    {
        return GetFirstString(args, "targetNodeId", "targetComponent", "component", "targetName", "targetTitle", "nodeId", "nodeName");
    }

    private static object BuildTool(string name, string description, object parameters)
    {
        return new
        {
            type = "function",
            function = new
            {
                name,
                description,
                parameters
            }
        };
    }

    private static JsonObject ParseArguments(string argumentsJson)
    {
        if (string.IsNullOrWhiteSpace(argumentsJson))
            return new JsonObject();

        return JsonNode.Parse(argumentsJson)?.AsObject()
            ?? throw new InvalidOperationException("Tool arguments must be a JSON object.");
    }

    private static JsonObject? ParseObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        try
        {
            return JsonNode.Parse(json)?.AsObject();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static JsonObject CreateComponentNode(string component, string? title, JsonObject? props)
    {
        var id = CreateId(component.ToLowerInvariant());
        var node = new JsonObject
        {
            ["id"] = id,
            ["name"] = id,
            ["title"] = title ?? component,
            ["type"] = component is "Checkbox" or "Switch" ? "boolean" : "string",
            ["x-component"] = component,
            ["x-component-props"] = CloneObject(props) ?? new JsonObject()
        };

        switch (component)
        {
            case "Container":
            case "Section":
                node["type"] = "object";
                node["x-component-props"] = MergeProps(new JsonObject { ["layout"] = "vertical" }, props);
                node["properties"] = new JsonObject();
                break;
            case "Grid.Row":
                node["type"] = "void";
                node["title"] = title ?? "Row";
                node["x-component-props"] = MergeProps(new JsonObject
                {
                    ["gutter"] = 16,
                    ["columns"] = 2,
                    ["align"] = "top",
                    ["justify"] = "start",
                    ["wrap"] = true
                }, props);
                node["properties"] = new JsonObject
                {
                    ["col1"] = CreateGridColumn("col1", "Column 1", 12, 0),
                    ["col2"] = CreateGridColumn("col2", "Column 2", 12, 1)
                };
                break;
            case "Grid.Col":
                node["type"] = "void";
                node["title"] = title ?? "Column";
                node["x-component-props"] = MergeProps(new JsonObject { ["span"] = 12 }, props);
                node["properties"] = new JsonObject();
                break;
            case "Tabs":
                node["type"] = "object";
                node["title"] = title ?? "Tabs";
                node["x-component-props"] = MergeProps(new JsonObject { ["tabPlacement"] = "top" }, props);
                node["properties"] = new JsonObject
                {
                    ["tabOne"] = CreateComponentNode("Section", "Tab one", null),
                    ["tabTwo"] = CreateComponentNode("Section", "Tab two", null)
                };
                break;
            case "Divider":
                node["title"] = title ?? "Divider";
                node["x-component-props"] = MergeProps(new JsonObject { ["titlePlacement"] = "left", ["text"] = "Divider" }, props);
                break;
            case "Heading":
                node["title"] = title ?? "Heading";
                node["x-component-props"] = MergeProps(new JsonObject { ["level"] = 2, ["text"] = title ?? "Heading" }, props);
                break;
            case "Text":
                node["title"] = title ?? "Text";
                node["x-component-props"] = MergeProps(new JsonObject { ["text"] = title ?? "Add text here." }, props);
                break;
            case "Button":
                node["title"] = title ?? "Button";
                node["x-component-props"] = MergeProps(new JsonObject { ["text"] = title ?? "Action" }, props);
                break;
            case "InputNumber":
                node["type"] = "number";
                node["title"] = title ?? "Number";
                node["x-component-props"] = MergeProps(new JsonObject { ["placeholder"] = "Enter number" }, props);
                break;
            case "Input":
                node["x-component-props"] = MergeProps(new JsonObject { ["placeholder"] = "Enter text" }, props);
                break;
            case "Input.TextArea":
            case "Textarea":
                node["title"] = title ?? "Text area";
                node["x-component-props"] = MergeProps(new JsonObject { ["placeholder"] = "Enter details" }, props);
                break;
            case "Select":
                node["enum"] = new JsonArray("Option A", "Option B");
                node["x-component-props"] = MergeProps(new JsonObject { ["placeholder"] = "Select an option" }, props);
                break;
            case "Reference":
                node["type"] = "array";
                node["title"] = title ?? "Reference";
                node["x-component-props"] = MergeProps(new JsonObject
                {
                    ["placeholder"] = "Select records",
                    ["targetTableId"] = null,
                    ["displayColumnId"] = "id",
                    ["relationshipMode"] = "lookup",
                    ["parentFieldName"] = "",
                    ["pickerVariant"] = "table"
                }, props);
                break;
            case "FormBlock":
                node["type"] = "object";
                node["title"] = title ?? "Form";
                node["x-component-props"] = MergeProps(new JsonObject
                {
                    ["tableId"] = null,
                    ["formColumns"] = new JsonArray(),
                    ["mode"] = "auto",
                    ["recordId"] = null,
                    ["recordIdParam"] = "id",
                    ["submitLabel"] = "Save",
                    ["saveAction"] = "none",
                    ["saveTargetPageId"] = null,
                    ["saveNavigationParams"] = new JsonObject(),
                    ["allowCreate"] = true,
                    ["allowEdit"] = true,
                    ["allowDelete"] = false,
                    ["useFormGroup"] = false,
                    ["formGroupKey"] = "",
                    ["showGroupSubmit"] = true
                }, props);
                node["properties"] = new JsonObject();
                break;
            case "TableBlock":
                node["type"] = "object";
                node["title"] = title ?? "Records";
                node["x-component-props"] = MergeProps(new JsonObject
                {
                    ["tableId"] = null,
                    ["pageSize"] = 10,
                    ["columns"] = new JsonArray(),
                    ["allowCreate"] = true,
                    ["allowEdit"] = true,
                    ["allowDelete"] = true,
                    ["createAction"] = "modal",
                    ["editAction"] = "modal",
                    ["rowClickAction"] = "none",
                    ["rowTargetPageId"] = null,
                    ["createTargetPageId"] = null,
                    ["editTargetPageId"] = null
                }, props);
                node["properties"] = new JsonObject();
                break;
        }

        return node;
    }

    private static JsonObject CreateGridColumn(string name, string title, int span, int index)
    {
        var node = CreateComponentNode("Grid.Col", title, new JsonObject { ["span"] = span });
        node["name"] = name;
        node["x-index"] = index;
        return node;
    }

    private static JsonObject MergeProps(JsonObject defaults, JsonObject? props)
    {
        if (props == null)
            return defaults;

        foreach (var item in props)
        {
            defaults[item.Key] = CloneNode(item.Value);
        }

        return defaults;
    }

    private static void MergePropsInto(JsonObject target, JsonObject? props)
    {
        if (props == null)
            return;

        foreach (var item in props)
        {
            target[item.Key] = CloneNode(item.Value);
        }
    }

    private static void ApplyTableColumns(JsonObject target, string component, IReadOnlyList<Column> columns)
    {
        var visibleColumns = columns.Where(column => !IsHiddenColumn(column)).ToList();
        var props = target["x-component-props"] as JsonObject;
        if (props == null)
        {
            props = new JsonObject();
            target["x-component-props"] = props;
        }

        if (component.Equals("FormBlock", StringComparison.OrdinalIgnoreCase))
        {
            props["formColumns"] = new JsonArray(visibleColumns.Select(column => JsonValue.Create(column.Name)).ToArray<JsonNode?>());
            var properties = target["properties"] as JsonObject;
            if (properties == null)
            {
                properties = new JsonObject();
                target["properties"] = properties;
            }

            foreach (var column in visibleColumns)
            {
                if (!properties.ContainsKey(column.Name))
                {
                    properties[column.Name] = CreateFieldNodeFromColumn(column);
                }
            }
        }
        else if (component.Equals("TableBlock", StringComparison.OrdinalIgnoreCase))
        {
            props["columns"] = new JsonArray(visibleColumns
                .Select(column => new JsonObject
                {
                    ["title"] = column.Name,
                    ["dataIndex"] = column.Name
                })
                .ToArray<JsonNode?>());
        }
    }

    private static JsonObject CreateFieldNodeFromColumn(Column column)
    {
        var node = CreateComponentNode(GetFieldComponentForColumn(column), column.Name, ParseObject(column.ComponentPropsJson));
        node["name"] = column.Name;
        node["title"] = column.Name;
        node["type"] = GetJsonSchemaType(column.FieldType);
        node["required"] = column.IsRequired;
        node["x-field"] = column.Name;
        return node;
    }

    private static string GetFieldComponentForColumn(Column column)
    {
        return column.FieldType.ToLowerInvariant() switch
        {
            "longtext" => "Input.TextArea",
            "number" or "finance" => "InputNumber",
            "date" => "DatePicker",
            "checkbox" => "Switch",
            "select" or "combobox" => "Select",
            "reference" => "Reference",
            "file" => "File",
            _ => "Input"
        };
    }

    private static string GetJsonSchemaType(string fieldType)
    {
        return fieldType.ToLowerInvariant() switch
        {
            "checkbox" => "boolean",
            "number" or "finance" => "number",
            _ => "string"
        };
    }

    private static bool IsHiddenColumn(Column column)
    {
        var props = ParseObject(column.ComponentPropsJson);
        return props != null &&
            (GetBool(props, "hiddenInForms") == true
            || string.Equals(GetString(props, "type"), "parent-link", StringComparison.OrdinalIgnoreCase));
    }

    private static bool InsertNode(JsonObject parent, JsonObject node)
    {
        if (parent["properties"] is not JsonObject properties)
        {
            parent["properties"] = properties = new JsonObject();
        }

        var key = GetUniquePropertyKey(node["name"]?.GetValue<string>() ?? "component", properties);
        node["name"] = key;
        properties[key] = node;
        return true;
    }

    private static bool InsertNodeByReference(JsonObject schema, string parentReference, JsonObject node)
    {
        var matches = FindNodeReferenceMatches(schema, parentReference);

        if (matches.Count == 0)
            return false;

        if (matches.Count > 1)
            throw new InvalidOperationException($"Multiple parent components match '{parentReference}'. Please use a more specific parent node ID, name, or title.");

        return InsertNode(matches[0], node);
    }

    private static JsonObject FindSingleNodeByReference(JsonObject schema, string reference)
    {
        var matches = FindNodeReferenceMatches(schema, reference);
        if (matches.Count == 0)
            throw new InvalidOperationException($"Component '{reference}' was not found on the page.");

        if (matches.Count > 1)
            throw new InvalidOperationException($"Multiple components match '{reference}'. Please use a more specific node ID, name, or title.");

        return matches[0];
    }

    private static List<JsonObject> FindNodeReferenceMatches(JsonObject schema, string reference)
    {
        var matches = new List<JsonObject>();
        CollectNodeReferenceMatches(schema, reference, matches);
        return matches;
    }

    private static void CollectNodeReferenceMatches(JsonObject current, string parentReference, List<JsonObject> matches)
    {
        if (NodeMatchesReference(current, parentReference))
        {
            matches.Add(current);
        }

        if (current["properties"] is not JsonObject properties)
            return;

        foreach (var child in properties.Select(item => item.Value as JsonObject).Where(child => child != null))
        {
            CollectNodeReferenceMatches(child!, parentReference, matches);
        }
    }

    private static bool NodeMatchesReference(JsonObject node, string parentReference)
    {
        var reference = NormalizeReference(parentReference);
        if (string.IsNullOrWhiteSpace(reference))
            return false;

        return ReferenceEquals(node["id"], parentReference, reference)
            || ReferenceEquals(node["name"], parentReference, reference)
            || ReferenceEquals(node["title"], parentReference, reference)
            || ComponentMatchesReference(node["x-component"], reference);
    }

    private static bool ReferenceEquals(JsonNode? value, string rawReference, string normalizedReference)
    {
        var text = GetNodeString(value);
        if (text == null)
            return false;

        return string.Equals(text, rawReference, StringComparison.Ordinal)
            || string.Equals(NormalizeReference(text), normalizedReference, StringComparison.Ordinal);
    }

    private static bool ComponentMatchesReference(JsonNode? value, string normalizedReference)
    {
        var component = GetNodeString(value);
        if (component == null)
            return false;

        var normalizedComponent = NormalizeReference(component);
        return normalizedComponent == normalizedReference
            || (component.Equals("FormBlock", StringComparison.OrdinalIgnoreCase) && normalizedReference == "form")
            || (component.Equals("TableBlock", StringComparison.OrdinalIgnoreCase) && normalizedReference == "table");
    }

    private static string NormalizeReference(string value)
    {
        return Regex.Replace(value.Trim().ToLowerInvariant(), "[^a-z0-9]+", "");
    }

    private static string? GetNodeString(JsonNode? value)
    {
        return value is JsonValue jsonValue && jsonValue.TryGetValue<string>(out var text)
            ? text
            : null;
    }

    private static string GetUniquePropertyKey(string baseKey, JsonObject properties)
    {
        if (!properties.ContainsKey(baseKey))
            return baseKey;

        var index = 2;
        while (properties.ContainsKey($"{baseKey}_{index}"))
        {
            index++;
        }

        return $"{baseKey}_{index}";
    }

    private static string CreateDefaultPageSchemaJson(string name)
    {
        var schema = new JsonObject
        {
            ["type"] = "object",
            ["id"] = CreateId("page"),
            ["name"] = Regex.Replace(name, "[^a-zA-Z0-9]+", "") is var cleanName && !string.IsNullOrWhiteSpace(cleanName) ? cleanName : "NewPage",
            ["title"] = name,
            ["x-component"] = "Container",
            ["x-component-props"] = new JsonObject { ["layout"] = "vertical" },
            ["properties"] = new JsonObject()
        };

        return schema.ToJsonString();
    }

    private async Task<string> BuildUniqueSlug(string name)
    {
        var baseSlug = BuildSlug(name);
        if (string.IsNullOrWhiteSpace(baseSlug))
            baseSlug = "page";

        var slug = baseSlug;
        var suffix = 1;
        while (await _context.LowCodePages.AnyAsync(p => p.Slug == slug))
        {
            suffix++;
            slug = $"{baseSlug}-{suffix}";
        }

        return slug;
    }

    private static string BuildSlug(string name)
    {
        return Regex.Replace(name.Trim().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
    }

    private static List<Column> GetEffectiveColumns(Table table, IReadOnlyDictionary<int, Table> tableMap)
    {
        var columns = new List<Column>();
        AddEffectiveColumns(table, tableMap, columns, new HashSet<int>());
        return columns
            .GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.Last())
            .OrderBy(c => c.TableId == table.Id ? 1 : 0)
            .ThenBy(c => c.SortOrder)
            .ThenBy(c => c.Id)
            .ToList();
    }

    private static void AddEffectiveColumns(Table table, IReadOnlyDictionary<int, Table> tableMap, List<Column> columns, HashSet<int> visitedTableIds)
    {
        if (!visitedTableIds.Add(table.Id))
            return;

        if (table.InheritProperties &&
            table.ParentTableId.HasValue &&
            tableMap.TryGetValue(table.ParentTableId.Value, out var parentTable))
        {
            AddEffectiveColumns(parentTable, tableMap, columns, visitedTableIds);
        }

        columns.AddRange(table.Columns);
    }

    private async Task<int> GetNextSortOrderAsync(int tableId)
    {
        var maxSortOrder = await _context.Columns
            .Where(c => c.TableId == tableId)
            .MaxAsync(c => (int?)c.SortOrder);

        return (maxSortOrder ?? 0) + 1;
    }

    private static bool Can(ClaimsPrincipal user, string permission)
    {
        return user.HasClaim("permission", permission);
    }

    private static void Require(ClaimsPrincipal user, string permission)
    {
        if (!Can(user, permission))
            throw new UnauthorizedAccessException($"Missing required permission: {permission}");
    }

    private static string CreateId(string prefix)
    {
        var cleanPrefix = Regex.Replace(prefix, "[^a-zA-Z0-9_]+", "_").Trim('_');
        if (string.IsNullOrWhiteSpace(cleanPrefix))
            cleanPrefix = "node";

        return $"{cleanPrefix}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid().ToString("N")[..6]}";
    }

    private static string? NormalizeNullable(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string GetRequiredString(JsonObject args, string name)
    {
        var value = GetString(args, name);
        return string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"{name} is required.")
            : value.Trim();
    }

    private static int GetRequiredInt(JsonObject args, string name)
    {
        return GetInt(args, name) ?? throw new InvalidOperationException($"{name} is required.");
    }

    private static string? GetString(JsonObject args, string name)
    {
        var node = args[name];
        if (node == null)
            return null;

        return node is JsonValue value && value.TryGetValue<string>(out var text)
            ? text
            : node.ToJsonString();
    }

    private static string? GetFirstString(JsonObject args, params string[] names)
    {
        foreach (var name in names)
        {
            var value = NormalizeNullable(GetString(args, name));
            if (value != null)
                return value;
        }

        return null;
    }

    private static int? GetInt(JsonObject args, string name)
    {
        var node = args[name];
        if (node == null)
            return null;

        if (node is JsonValue value && value.TryGetValue<int>(out var number))
            return number;

        return int.TryParse(node.ToString(), out var parsed) ? parsed : null;
    }

    private static bool? GetBool(JsonObject args, string name)
    {
        var node = args[name];
        if (node == null)
            return null;

        if (node is JsonValue value && value.TryGetValue<bool>(out var boolean))
            return boolean;

        return bool.TryParse(node.ToString(), out var parsed) ? parsed : null;
    }

    private static string? GetObjectJson(JsonObject args, string name)
    {
        return args[name] is JsonObject node ? node.ToJsonString() : null;
    }

    private static JsonNode? CloneNode(JsonNode? node)
    {
        return node == null ? null : JsonNode.Parse(node.ToJsonString());
    }

    private static JsonObject? CloneObject(JsonObject? node)
    {
        return CloneNode(node) as JsonObject;
    }
}

public record AiToolExecution(string ToolName, bool Success, string Message, object? Data);
