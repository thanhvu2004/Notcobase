using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using System.Text.Json;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;
using notcobase.Services;

namespace notcobase.Controllers;

[ApiController]
[Route("api/tables/{tableId}/[controller]")]
[Authorize]
public class ColumnsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly DynamicTableService _dynamicTableService;
    private readonly SchemaMetadataSyncService _schemaMetadataSyncService;
    private readonly ILogger<ColumnsController> _logger;

    public ColumnsController(
        AppDbContext context,
        DynamicTableService dynamicTableService,
        SchemaMetadataSyncService schemaMetadataSyncService,
        ILogger<ColumnsController> logger)
    {
        _context = context;
        _dynamicTableService = dynamicTableService;
        _schemaMetadataSyncService = schemaMetadataSyncService;
        _logger = logger;
    }

    /// Get all columns for a table
    [HttpGet]
    // [Permission("columns.view")]
    public async Task<ActionResult<IEnumerable<ColumnResponseDto>>> GetColumns(int tableId)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        var columns = GetEffectiveColumns(table, tableMap)
            .Select(c => new ColumnResponseDto
            {
                Id = c.Id,
                Name = c.Name,
                FieldType = c.FieldType,
                IsRequired = c.IsRequired,
                TableId = c.TableId,
                IsInherited = c.TableId != tableId,
                SortOrder = c.SortOrder,
                ComponentPropsJson = c.ComponentPropsJson,
                CreatedAt = c.CreatedAt
            })
            .ToList();

        return Ok(columns);
    }

    /// Create a new column
    [HttpPost]
    [Permission("columns.create")]
    public async Task<ActionResult<ColumnResponseDto>> CreateColumn(int tableId, [FromBody] CreateColumnDto dto)
    {
        // Verify table exists
        var table = await _context.Tables
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Column name is required");

        if (string.IsNullOrWhiteSpace(dto.FieldType))
            return BadRequest("Field type is required");

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        if (GetEffectiveColumns(table, tableMap)
            .Any(c => string.Equals(c.Name, dto.Name, StringComparison.OrdinalIgnoreCase)))
        {
            return BadRequest("A column with this name already exists on this table or an inherited parent table");
        }

        var column = new Column
        {
            Name = dto.Name,
            FieldType = dto.FieldType,
            TableId = tableId,
            IsRequired = dto.IsRequired,
            SortOrder = await GetNextSortOrderAsync(tableId),
            ComponentPropsJson = dto.ComponentPropsJson ?? "{}"
        };

        _context.Columns.Add(column);
        await _context.SaveChangesAsync();

        var columnCount = await _context.Columns.CountAsync(c => c.TableId == tableId);

        // If this is the first column and the table doesn't have a physical table yet, create it
        if (!table.PhysicalTableCreated && columnCount == 1)
        {
            try
            {
                await _dynamicTableService.CreatePhysicalTableAsync(tableId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error creating physical table for table ID {tableId}");
                // Don't fail the request, but log the error
                // The user can retry creating records later
            }
        }

        // Sync the new column to the owning table and any existing child physical tables.
        try
        {
            await _dynamicTableService.AddColumnToTableAndDescendantsAsync(column);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error adding column to physical tables for table ID {tableId}");
            return StatusCode(500, "Error adding column to physical tables");
        }

        await _schemaMetadataSyncService.SyncTableAsync(tableId);

        var createdLinkTableIds = await SyncReferenceParentLinkAsync(column, null);
        foreach (var affectedTableId in createdLinkTableIds.Distinct())
        {
            await _schemaMetadataSyncService.SyncTableAsync(affectedTableId);
        }

        return CreatedAtAction(nameof(GetColumns), new { tableId }, new ColumnResponseDto
        {
            Id = column.Id,
            Name = column.Name,
            FieldType = column.FieldType,
            IsRequired = column.IsRequired,
            TableId = column.TableId,
            IsInherited = false,
            SortOrder = column.SortOrder,
            ComponentPropsJson = column.ComponentPropsJson,
            CreatedAt = column.CreatedAt
        });
    }

    /// Reorder columns owned by a table
    [HttpPut("reorder")]
    [Permission("columns.edit")]
    public async Task<IActionResult> ReorderColumns(int tableId, [FromBody] ReorderColumnsDto dto)
    {
        if (dto.ColumnIds == null || dto.ColumnIds.Count == 0)
            return BadRequest("Column IDs are required");

        if (dto.ColumnIds.Count != dto.ColumnIds.Distinct().Count())
            return BadRequest("Column IDs must be unique");

        var columns = await _context.Columns
            .Where(c => c.TableId == tableId)
            .ToListAsync();

        if (columns.Count == 0)
            return NotFound("No columns found for table");

        var knownColumnIds = columns.Select(c => c.Id).ToHashSet();
        if (dto.ColumnIds.Any(id => !knownColumnIds.Contains(id)))
            return BadRequest("Reorder can only include columns owned by this table");

        if (dto.ColumnIds.Count != columns.Count)
            return BadRequest("Reorder must include every column owned by this table");

        var orderById = dto.ColumnIds
            .Select((id, index) => new { id, sortOrder = index + 1 })
            .ToDictionary(item => item.id, item => item.sortOrder);

        foreach (var column in columns)
        {
            column.SortOrder = orderById[column.Id];
        }

        await _context.SaveChangesAsync();
        await _schemaMetadataSyncService.SyncTableAsync(tableId);

        return NoContent();
    }

    /// Update a column
    [HttpPut("{columnId}")]
    [Permission("columns.edit")]
    public async Task<IActionResult> UpdateColumn(int tableId, int columnId, [FromBody] UpdateColumnDto dto)
    {
        var column = await _context.Columns
            .FirstOrDefaultAsync(c => c.Id == columnId && c.TableId == tableId);

        if (column == null)
            return NotFound();

        var oldName = column.Name;
        var oldReferenceLink = GetReferenceLinkConfig(column);
        var newName = dto.Name?.Trim();
        var nameChanged = !string.IsNullOrWhiteSpace(newName) &&
            !string.Equals(oldName, newName, StringComparison.Ordinal);

        if (!string.IsNullOrWhiteSpace(newName))
        {
            var table = await _context.Tables
                .Include(t => t.Columns)
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tableId);

            if (table == null)
                return NotFound("Table not found");

            var tableMap = await _context.Tables
                .Include(t => t.Columns)
                .AsNoTracking()
                .ToDictionaryAsync(t => t.Id);

            if (GetEffectiveColumns(table, tableMap)
                .Any(c => c.Id != columnId &&
                        string.Equals(c.Name, newName, StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest("A column with this name already exists on this table or an inherited parent table");
            }

            column.Name = newName!;
        }

        if (!string.IsNullOrWhiteSpace(dto.FieldType))
            column.FieldType = dto.FieldType;

        if (dto.IsRequired.HasValue)
            column.IsRequired = dto.IsRequired.Value;

        if (dto.ComponentPropsJson is not null)
            column.ComponentPropsJson = NormalizeReferencePropsForColumnUpdate(dto.ComponentPropsJson, oldReferenceLink, oldName, column.Name);

        try
        {
            await _dynamicTableService.UpdateColumnInTableAndDescendantsAsync(column, oldName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error updating physical columns for table ID {tableId}");
            return StatusCode(500, "Error updating physical table columns");
        }

        _context.Columns.Update(column);
        await _context.SaveChangesAsync();

        var affectedLinkTableIds = await SyncReferenceParentLinkAsync(column, oldReferenceLink);
        foreach (var affectedTableId in affectedLinkTableIds.Distinct())
        {
            await _schemaMetadataSyncService.SyncTableAsync(affectedTableId);
        }

        await _schemaMetadataSyncService.SyncColumnUpdatedAsync(tableId, nameChanged ? oldName : null, nameChanged ? column.Name : null);

        return NoContent();
    }

    /// Delete a column
    [HttpDelete("{columnId}")]
    [Permission("columns.delete")]
    public async Task<IActionResult> DeleteColumn(int tableId, int columnId)
    {
        var column = await _context.Columns
            .FirstOrDefaultAsync(c => c.Id == columnId && c.TableId == tableId);

        if (column == null)
            return NotFound();

        var oldReferenceLink = GetReferenceLinkConfig(column);
        var table = await _context.Tables.FindAsync(tableId);
        if (table == null)
            return NotFound();

        try
        {
            await _dynamicTableService.DropColumnFromTableAndDescendantsAsync(column);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error dropping column from physical tables for table ID {tableId}");
            return StatusCode(500, "Error dropping column from physical tables");
        }

        var deletedColumnName = column.Name;
        _context.Columns.Remove(column);
        await _context.SaveChangesAsync();

        var affectedLinkTableIds = await CleanupReferenceParentLinkAsync(oldReferenceLink, column.Id);
        foreach (var affectedTableId in affectedLinkTableIds.Distinct())
        {
            await _schemaMetadataSyncService.SyncTableAsync(affectedTableId);
        }

        await _schemaMetadataSyncService.SyncColumnDeletedAsync(tableId, deletedColumnName);

        return NoContent();
    }

    private async Task<List<int>> SyncReferenceParentLinkAsync(Column column, ReferenceLinkConfig? oldConfig)
    {
        var affectedTableIds = new List<int>();
        var newConfig = GetReferenceLinkConfig(column);

        if (oldConfig?.IsValid == true && newConfig?.IsValid == true)
        {
            var sameTarget = oldConfig.TargetTableId == newConfig.TargetTableId;
            var sameParentField = string.Equals(oldConfig.ParentFieldName, newConfig.ParentFieldName, StringComparison.OrdinalIgnoreCase);

            if (sameTarget && !sameParentField)
            {
                var renamed = await RenameReferenceParentLinkAsync(oldConfig, newConfig, column.Id);
                if (renamed)
                    affectedTableIds.Add(newConfig.TargetTableId!.Value);
                else
                    affectedTableIds.AddRange(await CleanupReferenceParentLinkAsync(oldConfig, column.Id));
            }
            else if (!sameTarget)
            {
                affectedTableIds.AddRange(await CleanupReferenceParentLinkAsync(oldConfig, column.Id));
            }
        }
        else if (oldConfig?.IsValid == true)
        {
            affectedTableIds.AddRange(await CleanupReferenceParentLinkAsync(oldConfig, column.Id));
        }

        if (newConfig?.IsValid == true)
        {
            var ensured = await EnsureReferenceParentLinkColumnAsync(newConfig);
            if (ensured)
                affectedTableIds.Add(newConfig.TargetTableId!.Value);
        }

        return affectedTableIds.Distinct().ToList();
    }

    private async Task<List<int>> CleanupReferenceParentLinkAsync(ReferenceLinkConfig? config, int owningColumnId)
    {
        if (config?.IsValid != true)
            return new List<int>();

        if (await IsParentLinkUsedByAnotherReferenceAsync(config, owningColumnId))
            return new List<int>();

        var linkColumn = await FindParentLinkColumnAsync(config);
        if (linkColumn == null)
            return new List<int>();

        try
        {
            await _dynamicTableService.DropColumnFromTableAndDescendantsAsync(linkColumn);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error dropping related-record parent link column '{ColumnName}' from target table ID {TableId}", linkColumn.Name, config.TargetTableId);
            throw;
        }

        _context.Columns.Remove(linkColumn);
        await _context.SaveChangesAsync();
        return new List<int> { config.TargetTableId!.Value };
    }

    private async Task<bool> RenameReferenceParentLinkAsync(ReferenceLinkConfig oldConfig, ReferenceLinkConfig newConfig, int owningColumnId)
    {
        if (oldConfig.TargetTableId != newConfig.TargetTableId ||
            oldConfig.ParentFieldName == null ||
            newConfig.ParentFieldName == null ||
            await IsParentLinkUsedByAnotherReferenceAsync(oldConfig, owningColumnId))
        {
            return false;
        }

        var oldLinkColumn = await FindParentLinkColumnAsync(oldConfig);
        if (oldLinkColumn == null)
            return false;

        var existingNewColumn = await _context.Columns
            .FirstOrDefaultAsync(c => c.TableId == newConfig.TargetTableId &&
                c.Name.ToLower() == newConfig.ParentFieldName.ToLower());
        if (existingNewColumn != null && existingNewColumn.Id != oldLinkColumn.Id)
            return false;

        var oldName = oldLinkColumn.Name;
        oldLinkColumn.Name = newConfig.ParentFieldName;
        oldLinkColumn.FieldType = "number";
        oldLinkColumn.IsRequired = false;
        oldLinkColumn.ComponentPropsJson = BuildParentLinkPropsJson();

        await _dynamicTableService.UpdateColumnInTableAndDescendantsAsync(oldLinkColumn, oldName);
        _context.Columns.Update(oldLinkColumn);
        await _context.SaveChangesAsync();
        return true;
    }

    private async Task<bool> EnsureReferenceParentLinkColumnAsync(ReferenceLinkConfig config)
    {
        var linkColumn = await _context.Columns
            .FirstOrDefaultAsync(c => c.TableId == config.TargetTableId &&
                c.Name.ToLower() == config.ParentFieldName!.ToLower());

        if (linkColumn == null)
        {
            linkColumn = new Column
            {
                Name = config.ParentFieldName!,
                FieldType = "number",
                TableId = config.TargetTableId!.Value,
                IsRequired = false,
                SortOrder = await GetNextSortOrderAsync(config.TargetTableId.Value),
                ComponentPropsJson = BuildParentLinkPropsJson()
            };

            _context.Columns.Add(linkColumn);
            await _context.SaveChangesAsync();
            await _dynamicTableService.AddColumnToTableAndDescendantsAsync(linkColumn);
            return true;
        }

        if (linkColumn.FieldType.Equals("number", StringComparison.OrdinalIgnoreCase) &&
            !linkColumn.IsRequired &&
            IsParentLinkColumn(linkColumn))
        {
            return false;
        }

        var oldName = linkColumn.Name;
        linkColumn.FieldType = "number";
        linkColumn.IsRequired = false;
        linkColumn.ComponentPropsJson = BuildParentLinkPropsJson();

        await _dynamicTableService.UpdateColumnInTableAndDescendantsAsync(linkColumn, oldName);
        _context.Columns.Update(linkColumn);
        await _context.SaveChangesAsync();
        return true;
    }

    private async Task<Column?> FindParentLinkColumnAsync(ReferenceLinkConfig config)
    {
        if (config.TargetTableId == null || string.IsNullOrWhiteSpace(config.ParentFieldName))
            return null;

        var columnName = config.ParentFieldName.ToLower();
        var candidates = await _context.Columns
            .Where(c => c.TableId == config.TargetTableId &&
                c.Name.ToLower() == columnName)
            .ToListAsync();

        return candidates.FirstOrDefault(IsParentLinkColumn);
    }

    private async Task<bool> IsParentLinkUsedByAnotherReferenceAsync(ReferenceLinkConfig config, int owningColumnId)
    {
        if (config.TargetTableId == null || string.IsNullOrWhiteSpace(config.ParentFieldName))
            return false;

        var referenceColumns = await _context.Columns
            .Where(c => c.Id != owningColumnId && c.FieldType.ToLower() == "reference")
            .ToListAsync();

        return referenceColumns.Any(column =>
        {
            var otherConfig = GetReferenceLinkConfig(column);
            return otherConfig?.IsValid == true &&
                otherConfig.TargetTableId == config.TargetTableId &&
                string.Equals(otherConfig.ParentFieldName, config.ParentFieldName, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static ReferenceLinkConfig? GetReferenceLinkConfig(Column column)
    {
        if (!column.FieldType.Equals("reference", StringComparison.OrdinalIgnoreCase))
            return null;

        return GetReferenceLinkConfig(column.ComponentPropsJson, column.Name);
    }

    private static ReferenceLinkConfig? GetReferenceLinkConfig(string? componentPropsJson, string fallbackParentFieldName)
    {
        if (string.IsNullOrWhiteSpace(componentPropsJson))
            return null;

        try
        {
            using var document = JsonDocument.Parse(componentPropsJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return null;

            var mode = GetStringProperty(document.RootElement, "relationshipMode");
            if (!string.Equals(mode, "related", StringComparison.OrdinalIgnoreCase))
                return null;

            var targetTableId = GetIntProperty(document.RootElement, "targetTableId");
            var parentFieldName = GetStringProperty(document.RootElement, "parentFieldName");
            if (string.IsNullOrWhiteSpace(parentFieldName))
                parentFieldName = fallbackParentFieldName;

            return new ReferenceLinkConfig(targetTableId, parentFieldName?.Trim());
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string NormalizeReferencePropsForColumnUpdate(
        string componentPropsJson,
        ReferenceLinkConfig? oldReferenceLink,
        string oldColumnName,
        string newColumnName)
    {
        if (string.Equals(oldColumnName, newColumnName, StringComparison.OrdinalIgnoreCase) ||
            oldReferenceLink?.IsValid != true)
        {
            return componentPropsJson;
        }

        try
        {
            using var document = JsonDocument.Parse(componentPropsJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return componentPropsJson;

            var values = JsonSerializer.Deserialize<Dictionary<string, object?>>(componentPropsJson);
            if (values == null)
                return componentPropsJson;

            var nextConfig = GetReferenceLinkConfig(componentPropsJson, newColumnName);
            if (nextConfig?.IsValid == true &&
                string.Equals(nextConfig.ParentFieldName, oldColumnName, StringComparison.OrdinalIgnoreCase))
            {
                values["parentFieldName"] = newColumnName;
                return JsonSerializer.Serialize(values);
            }
        }
        catch (JsonException)
        {
            return componentPropsJson;
        }

        return componentPropsJson;
    }

    private static bool IsParentLinkColumn(Column column)
    {
        if (string.IsNullOrWhiteSpace(column.ComponentPropsJson))
            return false;

        try
        {
            using var document = JsonDocument.Parse(column.ComponentPropsJson);
            return document.RootElement.ValueKind == JsonValueKind.Object &&
                string.Equals(GetStringProperty(document.RootElement, "type"), "parent-link", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string BuildParentLinkPropsJson()
    {
        return JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["type"] = "parent-link",
            ["hiddenInForms"] = true
        });
    }

    private static string? GetStringProperty(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
            return null;

        return property.ValueKind switch
        {
            JsonValueKind.String => property.GetString(),
            JsonValueKind.Number => property.GetRawText(),
            _ => null
        };
    }

    private static int? GetIntProperty(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
            return null;

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var number))
            return number;

        if (property.ValueKind == JsonValueKind.String && int.TryParse(property.GetString(), out var stringNumber))
            return stringNumber;

        return null;
    }

    private sealed record ReferenceLinkConfig(int? TargetTableId, string? ParentFieldName)
    {
        public bool IsValid => TargetTableId.HasValue && !string.IsNullOrWhiteSpace(ParentFieldName);
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

    private static void AddEffectiveColumns(
        Table table,
        IReadOnlyDictionary<int, Table> tableMap,
        List<Column> columns,
        HashSet<int> visitedTableIds)
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
}

// DTOs for Columns
public class ColumnResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
    public int TableId { get; set; }
    public bool IsInherited { get; set; }
    public int SortOrder { get; set; }
    public string ComponentPropsJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
}

public class ReorderColumnsDto
{
    public List<int> ColumnIds { get; set; } = new();
}

public class CreateColumnDto
{
    public required string Name { get; set; }
    public required string FieldType { get; set; }
    public bool IsRequired { get; set; }
    public string? ComponentPropsJson { get; set; }
}

public class UpdateColumnDto
{
    public string? Name { get; set; }
    public string? FieldType { get; set; }
    public bool? IsRequired { get; set; }
    public string? ComponentPropsJson { get; set; }
}
