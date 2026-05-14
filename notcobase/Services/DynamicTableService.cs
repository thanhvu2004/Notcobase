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

    /// Creates a physical database table based on the metadata
    public async Task<bool> CreatePhysicalTableAsync(int tableId)
    {
        try
        {
            var table = await _context.Tables
                .Include(t => t.Columns)
                .Include(t => t.ParentTable)
                .FirstOrDefaultAsync(t => t.Id == tableId);

            var allTables = await _context.Tables
                .Include(t => t.Columns)
                .Include(t => t.ParentTable)
                .ToDictionaryAsync(t => t.Id);

            if (table == null)
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            if (table.PhysicalTableCreated)
                return true;

            var physicalTableName = GetPhysicalTableName(tableId);
            var effectiveColumns = GetEffectiveColumns(table, allTables);
            var userColumnDefinitions = BuildColumnDefinitions(effectiveColumns);
            var allColumnDefinitions = new List<string>
            {
                "Id INTEGER PRIMARY KEY AUTOINCREMENT"
            };

            allColumnDefinitions.AddRange(userColumnDefinitions);
            allColumnDefinitions.Add("CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
            allColumnDefinitions.Add("UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

            var sql = $@"
                CREATE TABLE [{physicalTableName}] (
                    {string.Join(",\n                    ", allColumnDefinitions)}
                )";

            await _context.Database.ExecuteSqlRawAsync(sql);

            // Mark table as created
            table.PhysicalTableCreated = true;
            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Physical table '{physicalTableName}' created for table ID {tableId}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to create physical table for table ID {tableId}");
            throw;
        }
    }

    /// Drops a physical database table
    public async Task<bool> DropPhysicalTableAsync(int tableId)
    {
        try
        {
            var table = await _context.Tables.FindAsync(tableId);
            if (table == null)
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            if (!table.PhysicalTableCreated)
                return true; // Already doesn't exist

            var physicalTableName = GetPhysicalTableName(tableId);
            var sql = $"DROP TABLE IF EXISTS [{physicalTableName}]";

            await _context.Database.ExecuteSqlRawAsync(sql);

            table.PhysicalTableCreated = false;
            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Physical table '{physicalTableName}' dropped for table ID {tableId}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to drop physical table for table ID {tableId}");
            throw;
        }
    }

    /// Adds a column to an existing physical table
    public async Task<bool> AddColumnAsync(Column column)
    {
        try
        {
            var table = await _context.Tables.FindAsync(column.TableId);
            if (table == null)
                throw new InvalidOperationException($"Table with ID {column.TableId} not found");

            if (!table.PhysicalTableCreated)
                return true; // Physical table not created yet, will be added when table is created

            var physicalTableName = GetPhysicalTableName(column.TableId);
            var columnDefinition = BuildColumnDefinition(column);
            var sql = $"ALTER TABLE [{physicalTableName}] ADD COLUMN {columnDefinition}";

            await _context.Database.ExecuteSqlRawAsync(sql);

            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Column '{column.Name}' added to physical table '{physicalTableName}'");
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
        var affectedTables = await GetTableAndDescendantsAsync(column.TableId);
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        foreach (var table in affectedTables)
        {
            var effectiveColumns = GetEffectiveColumns(tableMap[table.Id], tableMap);

            if (!table.PhysicalTableCreated)
            {
                if (effectiveColumns.Any())
                    await CreatePhysicalTableAsync(table.Id);

                continue;
            }

            await RebuildPhysicalTableAsync(table.Id, effectiveColumns);

            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
        }

        await _context.SaveChangesAsync();
        return true;
    }

    /// Rebuilds the owning table and every inheriting child physical table after a column edit.
    public async Task<bool> UpdateColumnInTableAndDescendantsAsync(Column updatedColumn, string oldName)
    {
        var affectedTables = await GetTableAndDescendantsAsync(updatedColumn.TableId);
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        foreach (var table in affectedTables.Where(t => t.PhysicalTableCreated))
        {
            var effectiveColumns = GetEffectiveColumns(tableMap[table.Id], tableMap, replacementColumn: updatedColumn);
            await RebuildPhysicalTableAsync(table.Id, effectiveColumns, oldName, updatedColumn.Name);

            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
        }

        await _context.SaveChangesAsync();
        return true;
    }

    /// Drops a column from the owning table and every inheriting child physical table.
    public async Task<bool> DropColumnFromTableAndDescendantsAsync(Column column)
    {
        var affectedTables = await GetTableAndDescendantsAsync(column.TableId);
        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .ToDictionaryAsync(t => t.Id);

        foreach (var table in affectedTables.Where(t => t.PhysicalTableCreated))
        {
            var effectiveColumns = GetEffectiveColumns(tableMap[table.Id], tableMap, excludedColumnId: column.Id);
            await RebuildPhysicalTableAsync(table.Id, effectiveColumns);

            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
        }

        await _context.SaveChangesAsync();
        return true;
    }

    /// Drops a column from an existing physical table
    public async Task<bool> DropColumnAsync(int tableId, string columnName)
    {
        try
        {
            var table = await _context.Tables
                .Include(t => t.Columns)
                .FirstOrDefaultAsync(t => t.Id == tableId);

            if (table == null)
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            if (!table.PhysicalTableCreated)
                return true;

            var remainingColumns = table.Columns
                .Where(c => c.Name != columnName)
                .ToList();

            var physicalTableName = GetPhysicalTableName(tableId);
            await RebuildPhysicalTableAsync(tableId, remainingColumns);

            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Column '{columnName}' fully removed from physical table '{physicalTableName}'");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to drop column {columnName} from table ID {tableId}");
            throw;
        }
    }

    /// Gets the physical table name for a table
    public string GetPhysicalTableName(int tableId)
    {
        return $"tbl_{tableId}";
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

    private async Task<List<Table>> GetTableAndDescendantsAsync(int tableId)
    {
        var allTables = await _context.Tables
            .Include(t => t.Columns)
            .ToListAsync();

        var byParent = allTables
            .Where(t => t.InheritProperties && t.ParentTableId.HasValue)
            .GroupBy(t => t.ParentTableId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var result = new List<Table>();
        var queue = new Queue<int>();
        queue.Enqueue(tableId);

        while (queue.Count > 0)
        {
            var currentId = queue.Dequeue();
            var currentTable = allTables.FirstOrDefault(t => t.Id == currentId);
            if (currentTable == null)
                continue;

            result.Add(currentTable);

            if (!byParent.TryGetValue(currentId, out var children))
                continue;

            foreach (var child in children)
            {
                queue.Enqueue(child.Id);
            }
        }

        return result;
    }

    private async Task RebuildPhysicalTableAsync(
        int tableId,
        IEnumerable<Column> effectiveColumns,
        string? oldColumnName = null,
        string? newColumnName = null)
    {
        var physicalTableName = GetPhysicalTableName(tableId);
        var tempTableName = $"{physicalTableName}_temp_{Guid.NewGuid():N}";
        var columns = effectiveColumns.ToList();
        var columnDefinitions = BuildColumnDefinitions(columns);
        var allColumnDefinitions = new List<string>
        {
            "Id INTEGER PRIMARY KEY AUTOINCREMENT"
        };

        allColumnDefinitions.AddRange(columnDefinitions);
        allColumnDefinitions.Add("CreatedAt DATETIME NOT NULL");
        allColumnDefinitions.Add("UpdatedAt DATETIME NOT NULL");

        var insertColumns = new List<string> { "Id" };
        insertColumns.AddRange(columns.Select(c => c.Name));
        insertColumns.Add("CreatedAt");
        insertColumns.Add("UpdatedAt");

        var existingColumnNames = await GetPhysicalColumnNamesAsync(physicalTableName);
        var selectColumns = new List<string>
        {
            existingColumnNames.Contains("Id") ? "[Id]" : "NULL"
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

        using var transaction = await _context.Database.BeginTransactionAsync();

        await _context.Database.ExecuteSqlRawAsync($@"
            CREATE TABLE [{tempTableName}] (
                {string.Join(",\n                ", allColumnDefinitions)}
            )");

        await _context.Database.ExecuteSqlRawAsync($@"
            INSERT INTO [{tempTableName}] ({string.Join(", ", insertColumns.Select(c => $"[{c}]"))})
            SELECT {string.Join(", ", selectColumns)}
            FROM [{physicalTableName}]");

        await _context.Database.ExecuteSqlRawAsync($"DROP TABLE [{physicalTableName}]");
        await _context.Database.ExecuteSqlRawAsync($"ALTER TABLE [{tempTableName}] RENAME TO [{physicalTableName}]");

        await transaction.CommitAsync();
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

    /// Builds SQL column definitions from Column models
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

    /// Maps FieldType to SQLite data types
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
