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
                .FirstOrDefaultAsync(t => t.Id == tableId);

            if (table == null)
                throw new InvalidOperationException($"Table with ID {tableId} not found");

            if (table.PhysicalTableCreated)
                return true; // Already created

            if (!table.Columns.Any())
                throw new InvalidOperationException("Cannot create a table without columns");

            var physicalTableName = GetPhysicalTableName(tableId);
            var columnDefinitions = BuildColumnDefinitions(table.Columns);

            var sql = $@"
                CREATE TABLE [{physicalTableName}] (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    {string.Join(",\n                    ", columnDefinitions)},
                    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

            if (!remainingColumns.Any())
                throw new InvalidOperationException("Cannot delete the last column from a table");

            var physicalTableName = GetPhysicalTableName(tableId);
            var tempTableName = $"{physicalTableName}_temp";

            var columnDefinitions = BuildColumnDefinitions(remainingColumns);
            var columnNames = string.Join(", ", remainingColumns.Select(c => $"[{c.Name}]"));

            using var transaction = await _context.Database.BeginTransactionAsync();

            await _context.Database.ExecuteSqlRawAsync($@"
                CREATE TABLE [{tempTableName}] (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    {string.Join(",\n                    ", columnDefinitions)},
                    CreatedAt DATETIME NOT NULL,
                    UpdatedAt DATETIME NOT NULL
                )");

            await _context.Database.ExecuteSqlRawAsync($@"
                INSERT INTO [{tempTableName}] (Id, {columnNames}, CreatedAt, UpdatedAt)
                SELECT Id, {columnNames}, CreatedAt, UpdatedAt
                FROM [{physicalTableName}]");

            await _context.Database.ExecuteSqlRawAsync($"DROP TABLE [{physicalTableName}]");
            await _context.Database.ExecuteSqlRawAsync($"ALTER TABLE [{tempTableName}] RENAME TO [{physicalTableName}]");

            table.UpdatedAt = DateTime.UtcNow;
            _context.Tables.Update(table);
            await _context.SaveChangesAsync();

            await transaction.CommitAsync();

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
