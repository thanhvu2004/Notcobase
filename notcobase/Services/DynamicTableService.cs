using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Services;

public class DynamicTableService
{
    private readonly AppDbContext _context;
    private readonly ILogger<DynamicTableService> _logger;

    public DynamicTableService(AppDbContext context, ILogger<DynamicTableService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// Creates a physical database table based on the metadata hierarchy.
    public async Task<bool> CreatePhysicalTableAsync(int tableId)
    {
        try
        {
            var tableMap = await _context.Tables
                .Include(t => t.Columns)
                .ToDictionaryAsync(t => t.Id);

            if (!tableMap.TryGetValue(tableId, out var table))
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            var rootTableId = GetRootTableId(table, tableMap);
            var rootTable = tableMap[rootTableId];

            if (rootTable.PhysicalTableCreated)
                return true;

            var physicalTableName = GetPhysicalTableName(rootTableId);
            var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap);
            var userColumnDefinitions = BuildColumnDefinitions(effectiveColumns);
            var allColumnDefinitions = new List<string>
            {
                "Id INTEGER PRIMARY KEY AUTOINCREMENT",
                "LogicalTableId INTEGER NOT NULL"
            };

            allColumnDefinitions.AddRange(userColumnDefinitions);
            allColumnDefinitions.Add("CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
            allColumnDefinitions.Add("UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

            var sql = $@"
                CREATE TABLE [{physicalTableName}] (
                    {string.Join(",\n                    ", allColumnDefinitions)}
                )";

            await _context.Database.ExecuteSqlRawAsync(sql);

            var hierarchyTables = GetHierarchyTables(rootTableId, tableMap);
            foreach (var hierarchyTable in hierarchyTables)
            {
                hierarchyTable.PhysicalTableCreated = true;
                hierarchyTable.UpdatedAt = DateTime.UtcNow;
                _context.Tables.Update(hierarchyTable);
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation($"Physical table '{physicalTableName}' created for hierarchy rooted at table ID {rootTableId}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to create physical table for table ID {tableId}");
            throw;
        }
    }

    /// Drops the physical database table for the root hierarchy.
    public async Task<bool> DropPhysicalTableAsync(int tableId)
    {
        try
        {
            var tableMap = await _context.Tables
                .Include(t => t.Columns)
                .ToDictionaryAsync(t => t.Id);

            if (!tableMap.TryGetValue(tableId, out var table))
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            var rootTableId = GetRootTableId(table, tableMap);
            var rootTable = tableMap[rootTableId];

            if (!rootTable.PhysicalTableCreated)
                return true;

            var physicalTableName = GetPhysicalTableName(rootTableId);
            var sql = $"DROP TABLE IF EXISTS [{physicalTableName}]";

            await _context.Database.ExecuteSqlRawAsync(sql);

            var hierarchyTables = GetHierarchyTables(rootTableId, tableMap);
            foreach (var hierarchyTable in hierarchyTables)
            {
                hierarchyTable.PhysicalTableCreated = false;
                hierarchyTable.UpdatedAt = DateTime.UtcNow;
                _context.Tables.Update(hierarchyTable);
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation($"Physical table '{physicalTableName}' dropped for hierarchy rooted at table ID {rootTableId}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to drop physical table for table ID {tableId}");
            throw;
        }
    }

    /// Synchronizes the physical storage when a table's inheritance metadata changes.
    public async Task<bool> SyncTableInheritanceAsync(int tableId, int? oldRootTableId = null)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(tableId, out var table))
            throw new InvalidOperationException($"Table with ID {tableId} not found");

        var newRootTableId = GetRootTableId(table, tableMap);
        var newRootTable = tableMap[newRootTableId];

        if (!newRootTable.PhysicalTableCreated)
        {
            await CreatePhysicalTableAsync(tableId);
            tableMap = await _context.Tables
                .Include(t => t.Columns)
                .ToDictionaryAsync(t => t.Id);
        }
        else
        {
            await RebuildRootPhysicalTableAsync(newRootTableId, tableMap);
        }

        if (oldRootTableId.HasValue && oldRootTableId.Value != newRootTableId)
        {
            await MoveSubtreeRowsToNewRootAsync(tableId, oldRootTableId.Value, newRootTableId);
            await RebuildRootPhysicalTableAsync(oldRootTableId.Value, tableMap);
            await RebuildRootPhysicalTableAsync(newRootTableId, tableMap);
        }

        return true;
    }

    private async Task RebuildRootPhysicalTableAsync(int rootTableId, Dictionary<int, Table> tableMap)
    {
        if (!tableMap.TryGetValue(rootTableId, out var rootTable))
            throw new InvalidOperationException($"Table with ID {rootTableId} not found");

        if (!rootTable.PhysicalTableCreated)
            return;

        var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap);
        await RebuildPhysicalTableAsync(rootTableId, effectiveColumns);
    }

    private async Task MoveSubtreeRowsToNewRootAsync(int movedTableId, int oldRootTableId, int newRootTableId)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(oldRootTableId, out var oldRootTable))
            throw new InvalidOperationException($"Table with ID {oldRootTableId} not found");

        if (!tableMap.TryGetValue(newRootTableId, out var newRootTable))
            throw new InvalidOperationException($"Table with ID {newRootTableId} not found");

        if (!oldRootTable.PhysicalTableCreated || !newRootTable.PhysicalTableCreated)
            return;

        var subtreeTableIds = GetHierarchyTables(movedTableId, tableMap)
            .Select(t => t.Id)
            .ToList();

        if (!subtreeTableIds.Any())
            return;

        var oldPhysicalName = GetPhysicalTableName(oldRootTableId);
        var newPhysicalName = GetPhysicalTableName(newRootTableId);

        var newRootColumns = GetHierarchyColumns(newRootTableId, tableMap);
        var oldPhysicalColumns = await GetPhysicalColumnNamesAsync(oldPhysicalName);

        var insertColumns = new List<string> { "LogicalTableId" };
        insertColumns.AddRange(newRootColumns.Select(c => c.Name));
        insertColumns.Add("CreatedAt");
        insertColumns.Add("UpdatedAt");

        var selectColumns = new List<string>
        {
            oldPhysicalColumns.Contains("LogicalTableId") ? "[LogicalTableId]" : movedTableId.ToString()
        };

        selectColumns.AddRange(newRootColumns.Select(column =>
        {
            if (oldPhysicalColumns.Contains(column.Name))
                return $"[{column.Name}]";

            return GetDefaultSqlValue(column);
        }));

        selectColumns.Add(oldPhysicalColumns.Contains("CreatedAt") ? "[CreatedAt]" : "CURRENT_TIMESTAMP");
        selectColumns.Add(oldPhysicalColumns.Contains("UpdatedAt") ? "[UpdatedAt]" : "CURRENT_TIMESTAMP");

        var subtreeIdList = string.Join(", ", subtreeTableIds);

        await _context.Database.ExecuteSqlRawAsync($@"
            INSERT INTO [{newPhysicalName}] ({string.Join(", ", insertColumns.Select(c => $"[{c}]"))})
            SELECT {string.Join(", ", selectColumns)}
            FROM [{oldPhysicalName}]
            WHERE LogicalTableId IN ({subtreeIdList})");

        await _context.Database.ExecuteSqlRawAsync($@"
            DELETE FROM [{oldPhysicalName}]
            WHERE LogicalTableId IN ({subtreeIdList})");
    }

    /// Adds a column to an existing hierarchy physical table.
    public async Task<bool> AddColumnAsync(Column column)
    {
        try
        {
            var tableMap = await _context.Tables
                .Include(t => t.Columns)
                .ToDictionaryAsync(t => t.Id);

            if (!tableMap.TryGetValue(column.TableId, out var table))
                throw new InvalidOperationException($"Table with ID {column.TableId} not found");

            var rootTableId = GetRootTableId(table, tableMap);
            var rootTable = tableMap[rootTableId];

            if (!rootTable.PhysicalTableCreated)
                return true;

            var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap);
            await RebuildPhysicalTableAsync(rootTableId, effectiveColumns);

            rootTable.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(rootTable);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Column '{column.Name}' added to physical hierarchy table '{GetPhysicalTableName(rootTableId)}'");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to add column {column.Name} to table ID {column.TableId}");
            throw;
        }
    }

    /// Adds a column to the owning table and every inheriting child physical table.
    public async Task<bool> AddColumnToTableAndDescendantsAsync(Column column)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(column.TableId, out var table))
            throw new InvalidOperationException($"Table with ID {column.TableId} not found");

        var rootTableId = GetRootTableId(table, tableMap);
        var rootTable = tableMap[rootTableId];
        var hierarchyTables = GetHierarchyTables(rootTableId, tableMap);
        var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap);

        if (!rootTable.PhysicalTableCreated && effectiveColumns.Any())
        {
            await CreatePhysicalTableAsync(column.TableId);
            return true;
        }

        if (rootTable.PhysicalTableCreated)
        {
            await RebuildPhysicalTableAsync(rootTableId, effectiveColumns);
            foreach (var hierarchyTable in hierarchyTables)
            {
                hierarchyTable.UpdatedAt = DateTime.UtcNow;
                _context.Tables.Update(hierarchyTable);
            }
            await _context.SaveChangesAsync();
        }

        return true;
    }

    /// Rebuilds the owning table and every inheriting child physical table after a column edit.
    public async Task<bool> UpdateColumnInTableAndDescendantsAsync(Column updatedColumn, string oldName)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(updatedColumn.TableId, out var table))
            throw new InvalidOperationException($"Table with ID {updatedColumn.TableId} not found");

        var rootTableId = GetRootTableId(table, tableMap);
        var rootTable = tableMap[rootTableId];

        if (!rootTable.PhysicalTableCreated)
            return true;

        var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap, replacementColumn: updatedColumn, excludedColumnId: null);
        await RebuildPhysicalTableAsync(rootTableId, effectiveColumns, oldName, updatedColumn.Name);

        foreach (var hierarchyTable in GetHierarchyTables(rootTableId, tableMap))
        {
            hierarchyTable.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(hierarchyTable);
        }

        await _context.SaveChangesAsync();
        return true;
    }

    /// Drops a column from the owning table and every inheriting child physical table.
    public async Task<bool> DropColumnFromTableAndDescendantsAsync(Column column)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(column.TableId, out var table))
            throw new InvalidOperationException($"Table with ID {column.TableId} not found");

        var rootTableId = GetRootTableId(table, tableMap);
        var rootTable = tableMap[rootTableId];

        if (!rootTable.PhysicalTableCreated)
            return true;

        var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap, excludedColumnId: column.Id);
        await RebuildPhysicalTableAsync(rootTableId, effectiveColumns);

        foreach (var hierarchyTable in GetHierarchyTables(rootTableId, tableMap))
        {
            hierarchyTable.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(hierarchyTable);
        }

        await _context.SaveChangesAsync();
        return true;
    }

    /// Drops a column from an existing physical table
    public async Task<bool> DropColumnAsync(int tableId, string columnName)
    {
        try
        {
            var tableMap = await _context.Tables
                .Include(t => t.Columns)
                .ToDictionaryAsync(t => t.Id);

            if (!tableMap.TryGetValue(tableId, out var table))
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            var rootTableId = GetRootTableId(table, tableMap);
            var rootTable = tableMap[rootTableId];

            if (!rootTable.PhysicalTableCreated)
                return true;

            var effectiveColumns = GetHierarchyColumns(rootTableId, tableMap)
                .Where(c => !string.Equals(c.Name, columnName, StringComparison.OrdinalIgnoreCase))
                .ToList();

            await RebuildPhysicalTableAsync(rootTableId, effectiveColumns);

            rootTable.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(rootTable);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Column '{columnName}' fully removed from physical table '{GetPhysicalTableName(rootTableId)}'");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to drop column {columnName} from table ID {tableId}");
            throw;
        }
    }

    public string GetPhysicalTableName(int tableId)
    {
        return $"tbl_{tableId}";
    }

    public async Task<string> GetPhysicalTableNameAsync(int tableId)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(tableId, out var table))
            throw new InvalidOperationException($"Table with ID {tableId} not found");

        var rootTableId = GetRootTableId(table, tableMap);
        return GetPhysicalTableName(rootTableId);
    }

    public async Task<bool> IsPhysicalTableCreatedAsync(int tableId)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(tableId, out var table))
            return false;

        var rootTableId = GetRootTableId(table, tableMap);
        return tableMap[rootTableId].PhysicalTableCreated;
    }

    public async Task<List<Column>> GetEffectiveColumnsAsync(int tableId)
    {
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        if (!tableMap.TryGetValue(tableId, out var table))
            throw new InvalidOperationException($"Table with ID {tableId} not found");

        return GetEffectiveColumns(table, tableMap);
    }

    private List<Column> GetEffectiveColumns(
        Table table,
        Dictionary<int, Table> allTables,
        Column? replacementColumn = null,
        int? excludedColumnId = null)
    {
        var result = new List<Column>();

        if (table.InheritProperties &&
            table.ParentTableId.HasValue &&
            allTables.TryGetValue(table.ParentTableId.Value, out var parentTable))
        {
            result.AddRange(GetEffectiveColumns(parentTable, allTables, replacementColumn, excludedColumnId));
        }

        result.AddRange(table.Columns);

        return result
            .Where(c => c.Id != excludedColumnId)
            .Select(c => replacementColumn != null && c.Id == replacementColumn.Id ? replacementColumn : c)
            .GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.Last())
            .ToList();
    }

    private int GetRootTableId(Table table, Dictionary<int, Table> allTables)
    {
        while (table.InheritProperties &&
               table.ParentTableId.HasValue &&
               allTables.TryGetValue(table.ParentTableId.Value, out var parentTable))
        {
            table = parentTable;
        }

        return table.Id;
    }

    private List<Table> GetHierarchyTables(int rootTableId, Dictionary<int, Table> allTables)
    {
        var result = new List<Table>();
        var childrenByParent = allTables
            .Values
            .Where(t => t.InheritProperties && t.ParentTableId.HasValue)
            .GroupBy(t => t.ParentTableId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var queue = new Queue<Table>();
        queue.Enqueue(allTables[rootTableId]);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            result.Add(current);

            if (!childrenByParent.TryGetValue(current.Id, out var children))
                continue;

            foreach (var child in children)
            {
                queue.Enqueue(child);
            }
        }

        return result;
    }

    private List<Column> GetHierarchyColumns(
        int rootTableId,
        Dictionary<int, Table> allTables,
        Column? replacementColumn = null,
        int? excludedColumnId = null)
    {
        var columnsByName = new Dictionary<string, Column>(StringComparer.OrdinalIgnoreCase);

        foreach (var table in GetHierarchyTables(rootTableId, allTables))
        {
            var effectiveColumns = GetEffectiveColumns(table, allTables, replacementColumn, excludedColumnId);
            foreach (var column in effectiveColumns)
            {
                if (columnsByName.TryGetValue(column.Name, out var existing))
                {
                    if (!string.Equals(existing.FieldType, column.FieldType, StringComparison.OrdinalIgnoreCase))
                    {
                        existing.FieldType = "text";
                    }

                    if (existing.IsRequired != column.IsRequired)
                    {
                        existing.IsRequired = false;
                    }
                }
                else
                {
                    columnsByName[column.Name] = new Column
                    {
                        Name = column.Name,
                        FieldType = column.FieldType,
                        IsRequired = column.IsRequired
                    };
                }
            }
        }

        return columnsByName.Values
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task RebuildPhysicalTableAsync(
        int rootTableId,
        IEnumerable<Column> effectiveColumns,
        string? oldColumnName = null,
        string? newColumnName = null)
    {
        var physicalTableName = GetPhysicalTableName(rootTableId);
        var tempTableName = $"{physicalTableName}_temp_{Guid.NewGuid():N}";
        var columns = effectiveColumns.ToList();
        var columnDefinitions = BuildColumnDefinitions(columns);
        var allColumnDefinitions = new List<string>
        {
            "Id INTEGER PRIMARY KEY AUTOINCREMENT",
            "LogicalTableId INTEGER NOT NULL"
        };

        allColumnDefinitions.AddRange(columnDefinitions);
        allColumnDefinitions.Add("CreatedAt DATETIME NOT NULL");
        allColumnDefinitions.Add("UpdatedAt DATETIME NOT NULL");

        var insertColumns = new List<string> { "Id", "LogicalTableId" };
        insertColumns.AddRange(columns.Select(c => c.Name));
        insertColumns.Add("CreatedAt");
        insertColumns.Add("UpdatedAt");

        var existingColumnNames = await GetPhysicalColumnNamesAsync(physicalTableName);
        var selectColumns = new List<string>
        {
            existingColumnNames.Contains("Id") ? "[Id]" : "NULL",
            existingColumnNames.Contains("LogicalTableId") ? "[LogicalTableId]" : rootTableId.ToString()
        };

        selectColumns.AddRange(columns.Select(column =>
        {
            if (!string.IsNullOrWhiteSpace(oldColumnName) &&
                !string.IsNullOrWhiteSpace(newColumnName) &&
                string.Equals(column.Name, newColumnName, StringComparison.OrdinalIgnoreCase) &&
                existingColumnNames.Contains(oldColumnName))
            {
                return $"[{oldColumnName}]";
            }

            return existingColumnNames.Contains(column.Name)
                ? $"[{column.Name}]"
                : GetDefaultSqlValue(column);
        }));

        selectColumns.Add(existingColumnNames.Contains("CreatedAt") ? "[CreatedAt]" : "CURRENT_TIMESTAMP");
        selectColumns.Add(existingColumnNames.Contains("UpdatedAt") ? "[UpdatedAt]" : "CURRENT_TIMESTAMP");

        var currentTransaction = _context.Database.CurrentTransaction;
        var ownsTransaction = currentTransaction == null;
        if (ownsTransaction)
            currentTransaction = await _context.Database.BeginTransactionAsync();

        await _context.Database.ExecuteSqlRawAsync($@"
            CREATE TABLE [{tempTableName}] (
                {string.Join(",\n                ", allColumnDefinitions)}
            )");

        await _context.Database.ExecuteSqlRawAsync($@"
            INSERT INTO [{tempTableName}] ({string.Join(", ", insertColumns.Select(c => $"[{c}]"))})
            SELECT {string.Join(", ", selectColumns)}
            FROM [{physicalTableName}]"
        );

        await _context.Database.ExecuteSqlRawAsync($"DROP TABLE [{physicalTableName}]");
        await _context.Database.ExecuteSqlRawAsync($"ALTER TABLE [{tempTableName}] RENAME TO [{physicalTableName}]");

        if (ownsTransaction && currentTransaction != null)
            await currentTransaction.CommitAsync();
    }

    private async Task<HashSet<string>> GetPhysicalColumnNamesAsync(string physicalTableName)
    {
        var columnNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var connection = _context.Database.GetDbConnection();

        if (connection.State != System.Data.ConnectionState.Open)
            await connection.OpenAsync();

        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info('{physicalTableName.Replace("'", "''")}')";

        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            columnNames.Add(reader.GetString(1));
        }

        return columnNames;
    }

    private List<string> BuildColumnDefinitions(IEnumerable<Column> columns)
    {
        return columns.Select(BuildColumnDefinition).ToList();
    }

    private string BuildColumnDefinition(Column column)
    {
        var sqlType = MapFieldTypeToSqlType(column.FieldType);
        var nullable = column.IsRequired ? "NOT NULL" : "NULL";
        return $"[{column.Name}] {sqlType} {nullable}";
    }

    private string GetDefaultSqlValue(Column column)
    {
        if (!column.IsRequired)
            return "NULL";

        return column.FieldType.ToLower() switch
        {
            "number" => "0",
            "integer" => "0",
            "boolean" => "0",
            "decimal" => "0",
            _ => "''"
        };
    }

    private string MapFieldTypeToSqlType(string fieldType)
    {
        return fieldType.ToLower() switch
        {
            "text" => "TEXT",
            "string" => "TEXT",
            "number" => "REAL",
            "integer" => "INTEGER",
            "date" => "TEXT",
            "datetime" => "TEXT",
            "boolean" => "INTEGER",
            "decimal" => "REAL",
            "email" => "TEXT",
            "url" => "TEXT",
            "json" => "TEXT",
            _ => "TEXT"
        };
    }
}
