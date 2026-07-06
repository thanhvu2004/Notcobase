using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;
using notcobase.Services;
using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace notcobase.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TablesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly DynamicTableService _dynamicTableService;
    private readonly SchemaMetadataSyncService _schemaMetadataSyncService;
    private readonly ILogger<TablesController> _logger;

    public TablesController(
        AppDbContext context,
        DynamicTableService dynamicTableService,
        SchemaMetadataSyncService schemaMetadataSyncService,
        ILogger<TablesController> logger)
    {
        _context = context;
        _dynamicTableService = dynamicTableService;
        _schemaMetadataSyncService = schemaMetadataSyncService;
        _logger = logger;
    }

    /// Get all tables
    [HttpGet]
    [Permission("tables.view")]
    public async Task<ActionResult<IEnumerable<TableDto>>> GetTables()
    {
        var tables = await _context.Tables
            .Include(t => t.Columns)
            .Include(t => t.ParentTable)
            .AsNoTracking()
            .ToListAsync();

        var tableMap = tables.ToDictionary(t => t.Id);
        var dtos = tables.Select(t => new TableDto
            {
                Id = t.Id,
                Name = t.Name,
                Description = t.Description,
                InheritProperties = t.InheritProperties,
                ParentTableId = t.ParentTableId,
                ParentTableName = t.ParentTable?.Name,
                ColumnCount = GetEffectiveColumns(t, tableMap).Count,
                PhysicalTableCreated = GetRootPhysicalCreated(t, tableMap),
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt
            })
            .ToList();

        return Ok(dtos);
    }

    /// Get a specific table by ID
    [HttpGet("{id}")]
    [Permission("tables.view")]
    public async Task<ActionResult<TableDetailsDto>> GetTable(int id)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .Include(t => t.ParentTable)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (table == null)
            return NotFound();

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        var dto = new TableDetailsDto
        {
            Id = table.Id,
            Name = table.Name,
            Description = table.Description,
            InheritProperties = table.InheritProperties,
            ParentTableId = table.ParentTableId,
            ParentTableName = table.ParentTable?.Name,
            Columns = GetEffectiveColumns(table, tableMap).Select(c => new ColumnDto
            {
                Id = c.Id,
                Name = c.Name,
                FieldType = c.FieldType,
                IsRequired = c.IsRequired,
                TableId = c.TableId,
                IsInherited = c.TableId != table.Id,
                SortOrder = c.SortOrder,
                ComponentDefinitionId = c.ComponentDefinitionId,
                ComponentPropsJson = c.ComponentPropsJson,
            }).ToList(),
            PhysicalTableCreated = GetRootPhysicalCreated(table, tableMap),
            CreatedAt = table.CreatedAt,
            UpdatedAt = table.UpdatedAt
        };

        return Ok(dto);
    }

    /// Create a new table
    [HttpPost]
    [Permission("tables.create")]
    public async Task<ActionResult<TableDto>> CreateTable([FromBody] CreateTableDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Table name is required");

        if (dto.InheritProperties && !dto.ParentTableId.HasValue)
            return BadRequest("Parent table is required when inheritance is enabled");

        if (dto.ParentTableId.HasValue && !await _context.Tables.AnyAsync(t => t.Id == dto.ParentTableId.Value))
            return BadRequest("Parent table not found");

        var table = new Table
        {
            Name = dto.Name,
            Description = dto.Description,
            InheritProperties = dto.InheritProperties,
            ParentTableId = dto.InheritProperties ? dto.ParentTableId : null
        };

        _context.Tables.Add(table);
        await _context.SaveChangesAsync();

        var parentTableName = table.ParentTableId.HasValue
            ? await _context.Tables
                .Where(t => t.Id == table.ParentTableId.Value)
                .Select(t => t.Name)
                .FirstOrDefaultAsync()
            : null;

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        if (tableMap.TryGetValue(table.Id, out var savedTableForCreation) &&
            GetEffectiveColumns(savedTableForCreation, tableMap).Any())
        {
            try
            {
                await _dynamicTableService.CreatePhysicalTableAsync(table.Id);
                table.PhysicalTableCreated = true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error creating inherited physical table for table ID {table.Id}");
                return StatusCode(500, "Error creating inherited physical table");
            }
        }

        return CreatedAtAction(nameof(GetTable), new { id = table.Id }, new TableDto
        {
            Id = table.Id,
            Name = table.Name,
            Description = table.Description,
            InheritProperties = table.InheritProperties,
            ParentTableId = table.ParentTableId,
            ParentTableName = parentTableName,
            ColumnCount = tableMap.TryGetValue(table.Id, out var savedTable)
                ? GetEffectiveColumns(savedTable, tableMap).Count
                : 0,
            PhysicalTableCreated = table.PhysicalTableCreated,
            CreatedAt = table.CreatedAt,
            UpdatedAt = table.UpdatedAt
        });
    }

    /// Import tables and records from an uploaded SQLite database file
    [HttpPost("import-external-database/preview")]
    [Permission("tables.create")]
    public async Task<ActionResult<List<ImportPreviewTableDto>>> PreviewExternalDatabase(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Database file is required");

        var tempFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.sqlite");

        try
        {
            await using (var stream = System.IO.File.Create(tempFilePath))
            {
                await file.CopyToAsync(stream);
            }

            await using var sourceConnection = new SqliteConnection($"Data Source={tempFilePath};Mode=ReadOnly");
            await sourceConnection.OpenAsync();

            var sourceTables = await GetSourceTableNamesAsync(sourceConnection);
            if (sourceTables.Count == 0)
                return BadRequest("No user tables were found in the uploaded database");

            var previews = new List<ImportPreviewTableDto>();
            foreach (var sourceTableName in sourceTables)
            {
                var sourceColumns = await GetSourceColumnsAsync(sourceConnection, sourceTableName);
                if (sourceColumns.Count == 0)
                    continue;

                var recordCount = await GetSourceTableRowCountAsync(sourceConnection, sourceTableName);
                previews.Add(new ImportPreviewTableDto
                {
                    SourceName = sourceTableName,
                    ColumnCount = sourceColumns.Count,
                    RecordCount = recordCount,
                });
            }

            if (previews.Count == 0)
                return BadRequest("No importable tables were found in the uploaded database");

            return Ok(previews);
        }
        catch (SqliteException ex)
        {
            _logger.LogError(ex, "Error reading uploaded SQLite database");
            return BadRequest("The uploaded file could not be read as a SQLite database");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error previewing external database");
            return StatusCode(500, "Error previewing external database");
        }
        finally
        {
            try
            {
                if (System.IO.File.Exists(tempFilePath))
                    System.IO.File.Delete(tempFilePath);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not remove temporary import file {TempFilePath}", tempFilePath);
            }
        }
    }

    [HttpPost("import-external-database")]
    [Permission("tables.create")]
    public async Task<ActionResult<ImportDatabaseResultDto>> ImportExternalDatabase(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Database file is required");

        var tempFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.sqlite");

        try
        {
            await using (var stream = System.IO.File.Create(tempFilePath))
            {
                await file.CopyToAsync(stream);
            }

            await using var sourceConnection = new SqliteConnection($"Data Source={tempFilePath};Mode=ReadOnly");
            await sourceConnection.OpenAsync();

            var sourceTables = await GetSourceTableNamesAsync(sourceConnection);
            if (sourceTables.Count == 0)
                return BadRequest("No user tables were found in the uploaded database");

            var selectedSourceTableNames = ReadSelectedSourceTableNames();
            if (selectedSourceTableNames != null)
            {
                sourceTables = sourceTables
                    .Where(name => selectedSourceTableNames.Contains(name, StringComparer.OrdinalIgnoreCase))
                    .ToList();

                if (sourceTables.Count == 0)
                    return BadRequest("No selected tables were found in the uploaded database");
            }

            var existingTableNames = await _context.Tables
                .Select(t => t.Name)
                .ToListAsync();
            var usedTableNames = new HashSet<string>(existingTableNames, StringComparer.OrdinalIgnoreCase);
            var importedTables = new List<ImportedTableDto>();

            foreach (var sourceTableName in sourceTables)
            {
                var sourceColumns = await GetSourceColumnsAsync(sourceConnection, sourceTableName);
                if (sourceColumns.Count == 0)
                    continue;

                var importedTableName = MakeUniqueName(SanitizeIdentifier(sourceTableName, "ImportedTable"), usedTableNames);
                usedTableNames.Add(importedTableName);

                var table = new Table
                {
                    Name = importedTableName,
                    Description = $"Imported from {file.FileName}:{sourceTableName}",
                    InheritProperties = false,
                    ParentTableId = null
                };

                _context.Tables.Add(table);
                await _context.SaveChangesAsync();

                var usedColumnNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var columnMappings = new List<ImportColumnMapping>();

                var sortOrder = 1;
                foreach (var sourceColumn in sourceColumns)
                {
                    var columnName = MakeUniqueName(SanitizeIdentifier(sourceColumn.Name, "Column"), usedColumnNames);
                    usedColumnNames.Add(columnName);

                    var column = new Column
                    {
                        Name = columnName,
                        FieldType = MapSqliteTypeToFieldType(sourceColumn.Type),
                        IsRequired = sourceColumn.NotNull,
                        TableId = table.Id,
                        SortOrder = sortOrder
                    };

                    _context.Columns.Add(column);
                    columnMappings.Add(new ImportColumnMapping(sourceColumn.Name, columnName));
                    sortOrder += 1;
                }

                await _context.SaveChangesAsync();
                await _dynamicTableService.CreatePhysicalTableAsync(table.Id);

                var importedRecordCount = await ImportRowsAsync(sourceConnection, sourceTableName, table.Id, columnMappings);

                importedTables.Add(new ImportedTableDto
                {
                    Id = table.Id,
                    Name = table.Name,
                    SourceName = sourceTableName,
                    ColumnCount = columnMappings.Count,
                    RecordCount = importedRecordCount
                });
            }

            if (importedTables.Count == 0)
                return BadRequest("No importable tables were found in the uploaded database");

            return Ok(new ImportDatabaseResultDto
            {
                TableCount = importedTables.Count,
                RecordCount = importedTables.Sum(t => t.RecordCount),
                Tables = importedTables
            });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Error parsing selected table names");
            return BadRequest("Invalid selected table list");
        }
        catch (SqliteException ex)
        {
            _logger.LogError(ex, "Error reading uploaded SQLite database");
            return BadRequest("The uploaded file could not be read as a SQLite database");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error importing external database");
            return StatusCode(500, "Error importing external database");
        }
        finally
        {
            try
            {
                if (System.IO.File.Exists(tempFilePath))
                    System.IO.File.Delete(tempFilePath);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not remove temporary import file {TempFilePath}", tempFilePath);
            }
        }
    }

    /// Update a table
    [HttpPut("{id}")]
    [Permission("tables.edit")]
    public async Task<IActionResult> UpdateTable(int id, [FromBody] UpdateTableDto dto)
    {
        var table = await _context.Tables.FindAsync(id);
        if (table == null)
            return NotFound();

        var oldTableName = table.Name;
        var oldParentTableId = table.ParentTableId;
        var oldInheritProperties = table.InheritProperties;
        var tableMap = await _context.Tables
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);
        var oldRootTableId = GetRootTableId(table, tableMap);

        if (!string.IsNullOrWhiteSpace(dto.Name))
            table.Name = dto.Name;

        if (dto.Description != null)
            table.Description = dto.Description;

        if (dto.InheritProperties.HasValue)
            table.InheritProperties = dto.InheritProperties.Value;

        if (dto.ParentTableId.HasValue)
        {
            if (dto.ParentTableId.Value == id)
                return BadRequest("A table cannot inherit from itself");

            if (!await _context.Tables.AnyAsync(t => t.Id == dto.ParentTableId.Value))
                return BadRequest("Parent table not found");

            if (await WouldCreateInheritanceCycle(id, dto.ParentTableId.Value))
                return BadRequest("This parent table would create an inheritance cycle");

            table.ParentTableId = dto.ParentTableId.Value;
            table.InheritProperties = true;
        }

        if (!table.InheritProperties)
            table.ParentTableId = null;

        if (table.InheritProperties && !table.ParentTableId.HasValue)
            return BadRequest("Parent table is required when inheritance is enabled");

        var newParentTableId = table.InheritProperties ? table.ParentTableId : null;
        var inheritanceChanged = oldInheritProperties != table.InheritProperties || oldParentTableId != newParentTableId;

        await using var transaction = await _context.Database.BeginTransactionAsync();

        table.UpdatedAt = DateTime.UtcNow;
        _context.Tables.Update(table);
        await _context.SaveChangesAsync();

        if (inheritanceChanged)
        {
            try
            {
                await _dynamicTableService.SyncTableInheritanceAsync(table.Id, oldRootTableId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error syncing inheritance for table ID {table.Id}");
                await transaction.RollbackAsync();
                return StatusCode(500, "Error syncing inheritance metadata");
            }
        }

        await transaction.CommitAsync();
        await _schemaMetadataSyncService.SyncTableAsync(table.Id, oldTableName);
        return NoContent();
    }

    /// Delete a table
    [HttpDelete("{id}")]
    [Permission("tables.delete")]
    public async Task<IActionResult> DeleteTable(int id)
    {
        var table = await _context.Tables.FindAsync(id);
        if (table == null)
            return NotFound();

        if (await _context.Tables.AnyAsync(t => t.ParentTableId == id))
            return BadRequest("Cannot delete a table while other tables inherit from it");

        // Drop the physical table if this table owns the hierarchy root or is independent.
        if (!table.InheritProperties && table.PhysicalTableCreated)
        {
            try
            {
                await _dynamicTableService.DropPhysicalTableAsync(id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error dropping physical table for table ID {id}");
                return StatusCode(500, "Error deleting physical table");
            }
        }

        _context.Tables.Remove(table);
        await _context.SaveChangesAsync();

        return NoContent();
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

    private static bool GetRootPhysicalCreated(Table table, IReadOnlyDictionary<int, Table> tableMap)
    {
        while (table.InheritProperties &&
               table.ParentTableId.HasValue &&
               tableMap.TryGetValue(table.ParentTableId.Value, out var parentTable))
        {
            table = parentTable;
        }

        return table.PhysicalTableCreated;
    }

    private static int GetRootTableId(Table table, IReadOnlyDictionary<int, Table> tableMap)
    {
        while (table.InheritProperties &&
               table.ParentTableId.HasValue &&
               tableMap.TryGetValue(table.ParentTableId.Value, out var parentTable))
        {
            table = parentTable;
        }

        return table.Id;
    }

    private async Task<bool> WouldCreateInheritanceCycle(int tableId, int parentTableId)
    {
        var tables = await _context.Tables
            .AsNoTracking()
            .Select(t => new { t.Id, t.ParentTableId })
            .ToDictionaryAsync(t => t.Id);

        var currentParentId = parentTableId;
        while (tables.TryGetValue(currentParentId, out var current))
        {
            if (current.Id == tableId)
                return true;

            if (!current.ParentTableId.HasValue)
                return false;

            currentParentId = current.ParentTableId.Value;
        }

        return false;
    }

    private static async Task<List<string>> GetSourceTableNamesAsync(SqliteConnection connection)
    {
        var tables = new List<string>();

        await using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%'
              AND name <> '__EFMigrationsHistory'
            ORDER BY name";

        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }

        return tables;
    }

    private static async Task<List<SourceColumnInfo>> GetSourceColumnsAsync(SqliteConnection connection, string tableName)
    {
        var columns = new List<SourceColumnInfo>();

        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info({QuoteSqliteIdentifier(tableName)})";

        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var columnName = reader.GetString(1);
            if (string.Equals(columnName, "Id", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(columnName, "CreatedAt", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(columnName, "UpdatedAt", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            columns.Add(new SourceColumnInfo(
                columnName,
                reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                !reader.IsDBNull(3) && reader.GetInt32(3) == 1));
        }

        return columns;
    }

    private async Task<int> ImportRowsAsync(
        SqliteConnection sourceConnection,
        string sourceTableName,
        int targetTableId,
        IReadOnlyList<ImportColumnMapping> columnMappings)
    {
        if (columnMappings.Count == 0)
            return 0;

        var physicalTableName = _dynamicTableService.GetPhysicalTableName(targetTableId);
        var importedCount = 0;

        var sourceColumnList = string.Join(", ", columnMappings.Select(c => QuoteSqliteIdentifier(c.SourceName)));
        await using var sourceCommand = sourceConnection.CreateCommand();
        sourceCommand.CommandText = $"SELECT {sourceColumnList} FROM {QuoteSqliteIdentifier(sourceTableName)}";

        var targetConnection = _context.Database.GetDbConnection();
        if (targetConnection.State != ConnectionState.Open)
            await targetConnection.OpenAsync();

        await using var reader = await sourceCommand.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            await using var insertCommand = targetConnection.CreateCommand();
            var targetColumns = string.Join(", ", columnMappings.Select(c => $"[{EscapeBracketIdentifier(c.TargetName)}]"));
            var parameterNames = columnMappings.Select((_, index) => $"@p{index}").ToList();

            insertCommand.CommandText = $@"
                INSERT INTO [{physicalTableName}] ([LogicalTableId], {targetColumns}, CreatedAt, UpdatedAt)
                VALUES (@logicalTableId, {string.Join(", ", parameterNames)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";

            var logicalTableIdParameter = insertCommand.CreateParameter();
            logicalTableIdParameter.ParameterName = "@logicalTableId";
            logicalTableIdParameter.Value = targetTableId;
            insertCommand.Parameters.Add(logicalTableIdParameter);

            for (var i = 0; i < columnMappings.Count; i++)
            {
                var parameter = insertCommand.CreateParameter();
                parameter.ParameterName = parameterNames[i];
                parameter.Value = reader.IsDBNull(i) ? DBNull.Value : ConvertImportedValue(reader.GetValue(i));
                insertCommand.Parameters.Add(parameter);
            }

            await insertCommand.ExecuteNonQueryAsync();
            importedCount++;
        }

        return importedCount;
    }

    private static string MapSqliteTypeToFieldType(string sqliteType)
    {
        var normalized = sqliteType.ToUpperInvariant();

        if (normalized.Contains("BOOL"))
            return "checkbox";

        if (normalized.Contains("INT") || normalized.Contains("REAL") || normalized.Contains("FLOA") ||
            normalized.Contains("DOUB") || normalized.Contains("NUM") || normalized.Contains("DEC"))
        {
            return "number";
        }

        if (normalized.Contains("DATE") || normalized.Contains("TIME"))
            return "date";

        return "text";
    }

    private static object ConvertImportedValue(object value)
    {
        return value is byte[] bytes
            ? Convert.ToBase64String(bytes)
            : value;
    }

    private static string SanitizeIdentifier(string value, string fallback)
    {
        var sanitized = Regex.Replace(value.Trim(), @"[^\w]+", "_").Trim('_');
        if (string.IsNullOrWhiteSpace(sanitized))
            sanitized = fallback;

        if (char.IsDigit(sanitized[0]))
            sanitized = $"{fallback}_{sanitized}";

        return sanitized.Length <= 255 ? sanitized : sanitized[..255];
    }

    private static string MakeUniqueName(string baseName, HashSet<string> usedNames)
    {
        var name = baseName;
        var suffix = 2;

        while (usedNames.Contains(name))
        {
            var suffixText = $"_{suffix}";
            var trimmedBase = baseName.Length + suffixText.Length > 255
                ? baseName[..(255 - suffixText.Length)]
                : baseName;
            name = $"{trimmedBase}{suffixText}";
            suffix++;
        }

        return name;
    }

    private static string QuoteSqliteIdentifier(string identifier)
    {
        return $"\"{identifier.Replace("\"", "\"\"")}\"";
    }

    private static string EscapeBracketIdentifier(string identifier)
    {
        return identifier.Replace("]", "]]");
    }
    private static async Task<int> GetSourceTableRowCountAsync(SqliteConnection connection, string tableName)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM {QuoteSqliteIdentifier(tableName)}";

        var result = await command.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    private List<string>? ReadSelectedSourceTableNames()
    {
        if (!Request.Form.TryGetValue("selectedTables", out var selectedTablesValue) || selectedTablesValue.Count == 0)
            return null;

        var selectedTableNames = JsonSerializer.Deserialize<List<string>>(selectedTablesValue[0]);
        return selectedTableNames?.Any() == true ? selectedTableNames : null;
    }
    private sealed record SourceColumnInfo(string Name, string Type, bool NotNull);
    private sealed record ImportColumnMapping(string SourceName, string TargetName);
}

// DTOs for Tables
public class TableDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool InheritProperties { get; set; }
    public int? ParentTableId { get; set; }
    public string? ParentTableName { get; set; }
    public int ColumnCount { get; set; }
    public bool PhysicalTableCreated { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class TableDetailsDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool InheritProperties { get; set; }
    public int? ParentTableId { get; set; }
    public string? ParentTableName { get; set; }
    public List<ColumnDto> Columns { get; set; } = new();
    public bool PhysicalTableCreated { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateTableDto
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public bool InheritProperties { get; set; }
    public int? ParentTableId { get; set; }
}

public class UpdateTableDto
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool? InheritProperties { get; set; }
    public int? ParentTableId { get; set; }
}

public class ColumnDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
    public int TableId { get; set; }
    public bool IsInherited { get; set; }
    public int SortOrder { get; set; }
    public int? ComponentDefinitionId { get; set; }
    public string ComponentPropsJson { get; set; } = "{}";
}

public class ImportDatabaseResultDto
{
    public int TableCount { get; set; }
    public int RecordCount { get; set; }
    public List<ImportedTableDto> Tables { get; set; } = new();
}

public class ImportedTableDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
    public int ColumnCount { get; set; }
    public int RecordCount { get; set; }
}

public class ImportPreviewTableDto
{
    public string SourceName { get; set; } = string.Empty;
    public int ColumnCount { get; set; }
    public int RecordCount { get; set; }
}
