using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Services;

public class SchemaMetadataSyncService
{
    private readonly AppDbContext _context;
    private readonly ILogger<SchemaMetadataSyncService> _logger;

    public SchemaMetadataSyncService(AppDbContext context, ILogger<SchemaMetadataSyncService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task SyncTableAsync(int tableId, string? oldTableName = null)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return;

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        var columns = GetEffectiveColumns(table, tableMap);
        await SyncPagesAsync(table, columns, null, null, oldTableName);
    }

    public async Task SyncColumnUpdatedAsync(int tableId, string? oldColumnName = null, string? newColumnName = null)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return;

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        var columns = GetEffectiveColumns(table, tableMap);
        await SyncPagesAsync(table, columns, oldColumnName, newColumnName, null);
    }

    public async Task SyncColumnDeletedAsync(int tableId, string deletedColumnName)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return;

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        var columns = GetEffectiveColumns(table, tableMap);
        await SyncPagesAsync(table, columns, deletedColumnName, null, null);
    }

    private async Task SyncPagesAsync(Table table, IReadOnlyList<Column> columns, string? oldColumnName, string? newColumnName, string? oldTableName)
    {
        var pages = await _context.LowCodePages.ToListAsync();
        var changed = false;

        foreach (var page in pages)
        {
            try
            {
                var root = JsonNode.Parse(page.SchemaJson);
                if (root is not JsonObject schema)
                    continue;

                var pageChanged = SyncNode(schema, table, columns, oldColumnName, newColumnName, oldTableName);
                if (!pageChanged)
                    continue;

                page.SchemaJson = schema.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
                page.UpdatedAt = DateTime.UtcNow;
                changed = true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not sync schema metadata for page {PageId}", page.Id);
            }
        }

        if (changed)
            await _context.SaveChangesAsync();
    }

    private static bool SyncNode(JsonObject node, Table table, IReadOnlyList<Column> columns, string? oldColumnName, string? newColumnName, string? oldTableName)
    {
        var changed = false;
        var component = GetString(node, "x-component");
        var props = node["x-component-props"] as JsonObject;
        var tableId = GetInt(props, "tableId");
        var referencesTable = tableId == table.Id;

        if (referencesTable)
        {
            if ((component == "FormBlock" || component == "DetailCard") && SyncFormLikeBlock(node, props!, table, columns, oldColumnName, newColumnName))
                changed = true;

            if (component == "TableBlock" && SyncTableBlock(node, props!, table, columns, oldColumnName, newColumnName))
                changed = true;

            var currentTitle = GetString(props, "title");
            if (props != null && (string.IsNullOrWhiteSpace(currentTitle) ||
                (oldTableName != null && string.Equals(currentTitle, oldTableName, StringComparison.Ordinal))))
            {
                props["title"] = table.Name;
                changed = true;
            }
        }

        var properties = node["properties"] as JsonObject;
        if (properties != null)
        {
            foreach (var child in properties.ToList())
            {
                if (child.Value is JsonObject childObject && SyncNode(childObject, table, columns, oldColumnName, newColumnName, oldTableName))
                    changed = true;
            }
        }

        return changed;
    }

    private static bool SyncFormLikeBlock(JsonObject node, JsonObject props, Table table, IReadOnlyList<Column> columns, string? oldColumnName, string? newColumnName)
    {
        var changed = false;
        var selectedColumns = ReadStringArray(props["formColumns"]);

        if (!selectedColumns.Any())
        {
            selectedColumns = GetFieldNodes(node)
                .Select(item => GetString(item.Node, "x-field") ?? item.Key)
                .ToList();
        }

        if (oldColumnName != null)
        {
            selectedColumns = selectedColumns
                .Select(name => string.Equals(name, oldColumnName, StringComparison.OrdinalIgnoreCase) ? newColumnName : name)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .ToList()!;
            props["formColumns"] = new JsonArray(selectedColumns.Select(name => JsonValue.Create(name)).ToArray());
            changed = true;
        }

        var selectedSet = new HashSet<string>(selectedColumns, StringComparer.OrdinalIgnoreCase);
        var requiredKeys = new List<string>();

        foreach (var (key, fieldNode) in GetFieldNodes(node))
        {
            var fieldName = GetString(fieldNode, "x-field") ?? key;
            var column = columns.FirstOrDefault(c => selectedSet.Contains(c.Name) &&
                (string.Equals(c.Name, fieldName, StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(oldColumnName, fieldName, StringComparison.OrdinalIgnoreCase)));

            if (column == null)
            {
                if (oldColumnName != null && string.Equals(fieldName, oldColumnName, StringComparison.OrdinalIgnoreCase))
                {
                    RemoveProperty(node, key);
                    changed = true;
                }
                continue;
            }

            if (ApplyColumnToFieldNode(fieldNode, column))
                changed = true;

            if (column.IsRequired)
                requiredKeys.Add(key);
        }

        if (SetRequired(node, requiredKeys))
            changed = true;

        return changed;
    }

    private static bool SyncTableBlock(JsonObject node, JsonObject props, Table table, IReadOnlyList<Column> columns, string? oldColumnName, string? newColumnName)
    {
        var configuredColumns = props["columns"] as JsonArray;
        if (configuredColumns == null || configuredColumns.Count == 0)
            return false;

        var changed = false;
        foreach (var item in configuredColumns.OfType<JsonObject>().ToList())
        {
            var dataIndex = GetString(item, "dataIndex") ?? GetString(item, "key") ?? GetString(item, "title");
            if (dataIndex == null)
                continue;

            var column = columns.FirstOrDefault(c =>
                string.Equals(c.Name, dataIndex, StringComparison.OrdinalIgnoreCase) ||
                (oldColumnName != null && string.Equals(oldColumnName, dataIndex, StringComparison.OrdinalIgnoreCase)));

            if (column == null)
                continue;

            item["title"] = column.Name;
            item["dataIndex"] = column.Name;
            item["key"] = column.Name;
            item["fieldType"] = column.FieldType;
            item["componentPropsJson"] = column.ComponentPropsJson;
            changed = true;
        }

        return changed;
    }

    private static bool ApplyColumnToFieldNode(JsonObject node, Column column)
    {
        var changed = false;
        var mapping = FieldTypeToSchemaComponent(column.FieldType);

        changed |= SetString(node, "title", column.Name);
        changed |= SetString(node, "name", SanitizePropertyKey(column.Name));
        changed |= SetString(node, "type", mapping.SchemaType);
        changed |= SetString(node, "x-component", mapping.Component);
        changed |= SetString(node, "x-field", column.Name);

        if (mapping.Format != null)
            changed |= SetString(node, "format", mapping.Format);
        else if (node.Remove("format"))
            changed = true;

        var props = node["x-component-props"] as JsonObject ?? new JsonObject();
        node["x-component-props"] = props;
        changed |= SetString(props, "placeholder", column.Name);

        var componentProps = ParseJsonObject(column.ComponentPropsJson);
        foreach (var pair in componentProps)
        {
            props[pair.Key] = pair.Value == null ? null : JsonNode.Parse(pair.Value.ToJsonString());
            changed = true;
        }

        if (column.FieldType.Equals("reference", StringComparison.OrdinalIgnoreCase))
        {
            props["pickerVariant"] = "table";
            changed = true;
        }

        if (column.IsRequired)
            node["required"] = true;
        else if (node.Remove("required"))
            changed = true;

        return changed;
    }

    private static List<(string Key, JsonObject Node)> GetFieldNodes(JsonObject blockNode)
    {
        var result = new List<(string Key, JsonObject Node)>();
        var properties = blockNode["properties"] as JsonObject;
        if (properties == null)
            return result;

        foreach (var pair in properties)
        {
            if (pair.Value is JsonObject child)
            {
                if (!string.IsNullOrWhiteSpace(GetString(child, "x-field")))
                    result.Add((pair.Key, child));

                result.AddRange(GetFieldNodes(child));
            }
        }

        return result;
    }

    private static void RemoveProperty(JsonObject blockNode, string key)
    {
        var properties = blockNode["properties"] as JsonObject;
        properties?.Remove(key);
    }

    private static bool SetRequired(JsonObject node, IReadOnlyList<string> requiredKeys)
    {
        if (requiredKeys.Count == 0)
            return node.Remove("required");

        node["required"] = new JsonArray(requiredKeys.Select(key => JsonValue.Create(key)).ToArray());
        return true;
    }

    private static List<string> ReadStringArray(JsonNode? node)
    {
        if (node is not JsonArray array)
            return new List<string>();

        return array
            .Select(item => item?.GetValue<string>())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToList()!;
    }

    private static JsonObject ParseJsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new JsonObject();

        try
        {
            return JsonNode.Parse(json) as JsonObject ?? new JsonObject();
        }
        catch
        {
            return new JsonObject();
        }
    }

    private static string? GetString(JsonObject? node, string key)
    {
        return node != null && node.TryGetPropertyValue(key, out var value) ? value?.GetValue<string>() : null;
    }

    private static int? GetInt(JsonObject? node, string key)
    {
        if (node == null || !node.TryGetPropertyValue(key, out var value) || value == null)
            return null;

        try
        {
            return value.GetValue<int>();
        }
        catch
        {
            try
            {
                return int.TryParse(value.GetValue<string>(), out var id) ? id : null;
            }
            catch
            {
                return null;
            }
        }
    }

    private static bool SetString(JsonObject node, string key, string value)
    {
        if (GetString(node, key) == value)
            return false;

        node[key] = value;
        return true;
    }

    private static (string SchemaType, string Component, string? Format) FieldTypeToSchemaComponent(string fieldType)
    {
        return fieldType.ToLowerInvariant() switch
        {
            "number" => ("number", "InputNumber", null),
            "date" => ("string", "DatePicker", "date"),
            "boolean" or "checkbox" => ("boolean", "Switch", null),
            "select" => ("string", "Select", null),
            "reference" => ("array", "Reference", null),
            "longtext" => ("string", "Input.TextArea", null),
            _ => ("string", "Input", null)
        };
    }

    private static string SanitizePropertyKey(string columnName)
    {
        var key = Regex.Replace(columnName, "[^a-zA-Z0-9_]", "_");
        return Regex.IsMatch(key, "^[a-zA-Z_]") ? key : $"field_{key}";
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

        if (table.InheritProperties && table.ParentTableId.HasValue && tableMap.TryGetValue(table.ParentTableId.Value, out var parentTable))
            AddEffectiveColumns(parentTable, tableMap, columns, visitedTableIds);

        columns.AddRange(table.Columns);
    }
}
