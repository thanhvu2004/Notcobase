using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;
using notcobase.Services;
using System.Data;
using System.Text;

namespace notcobase.Controllers;

[ApiController]
[Route("api/tables/{tableId}/[controller]")]
[Authorize]
public class RecordsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly DynamicTableService _dynamicTableService;
    private readonly ILogger<RecordsController> _logger;

    public RecordsController(AppDbContext context, DynamicTableService dynamicTableService, ILogger<RecordsController> logger)
    {
        _context = context;
        _dynamicTableService = dynamicTableService;
        _logger = logger;
    }

    /// Get all records from a table
    [HttpGet]
    [Permission("records.view")]
    public async Task<ActionResult<IEnumerable<RecordDto>>> GetRecords(
        int tableId,
        [FromQuery] int? skip = 0,
        [FromQuery] int? limit = 100,
        [FromQuery] string? filterField = null,
        [FromQuery] string? filterValue = null)
    {
        // Verify table exists and physical table is created
        var table = await _context.Tables
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!await _dynamicTableService.IsPhysicalTableCreatedAsync(tableId))
            return Ok(new List<RecordDto>());

        try
        {
            var skipValue = skip ?? 0;
            var limitValue = limit ?? 100;

            var path = await _dynamicTableService.GetTablePathAsync(tableId);
            var columns = await _dynamicTableService.GetEffectiveColumnsAsync(tableId);
            var columnList = BuildSelectColumnList(columns, path);
            var fromClause = BuildFromClause(path);
            var lastAlias = $"t{path.Count - 1}";
            var whereClause = BuildFilterWhereClause(columns, path, filterField, filterValue);

            var sql = $@"
                SELECT {lastAlias}.Id{columnList}, {lastAlias}.CreatedAt, {lastAlias}.UpdatedAt
                {fromClause}
                {whereClause}
                ORDER BY {lastAlias}.CreatedAt DESC
                LIMIT {limitValue} OFFSET {skipValue}";

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                using (var reader = await command.ExecuteReaderAsync())
                {
                    var dtos = new List<RecordDto>();
                    while (await reader.ReadAsync())
                    {
                        var dto = ReadRecordDto(reader);
                        dtos.Add(dto);
                    }
                    return Ok(dtos);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error retrieving records from table {tableId}");
            return StatusCode(500, "Error retrieving records");
        }
    }

    /// Get a specific record
    [HttpGet("{recordId}")]
    [Permission("records.view")]
    public async Task<ActionResult<RecordDto>> GetRecord(int tableId, int recordId)
    {
        var table = await _context.Tables
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!await _dynamicTableService.IsPhysicalTableCreatedAsync(tableId))
            return NotFound("Record not found");

        try
        {
            var path = await _dynamicTableService.GetTablePathAsync(tableId);
            var columns = await _dynamicTableService.GetEffectiveColumnsAsync(tableId);
            var columnList = BuildSelectColumnList(columns, path);
            var fromClause = BuildFromClause(path);
            var lastAlias = $"t{path.Count - 1}";

            var sql = $@"
                SELECT {lastAlias}.Id{columnList}, {lastAlias}.CreatedAt, {lastAlias}.UpdatedAt
                {fromClause}
                WHERE {lastAlias}.Id = {recordId}";

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                using (var reader = await command.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        var dto = ReadRecordDto(reader);
                        return Ok(dto);
                    }
                    return NotFound("Record not found");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error retrieving record {recordId} from table {tableId}");
            return StatusCode(500, "Error retrieving record");
        }
    }

    /// Create a new record
    [HttpPost]
    [Permission("records.create")]
    public async Task<ActionResult<RecordDto>> CreateRecord(int tableId, [FromBody] CreateRecordDto dto)
    {
        var table = await _context.Tables
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!await _dynamicTableService.IsPhysicalTableCreatedAsync(tableId))
            return BadRequest("Physical table has not been created yet. Please add columns first.");

        var path = await _dynamicTableService.GetTablePathAsync(tableId);
        var columns = await _dynamicTableService.GetEffectiveColumnsAsync(tableId);
        var validationResult = ValidateRecordData(dto.Data, columns, requireMissingRequiredFields: true);
        if (!validationResult.IsValid)
            return BadRequest(validationResult.ErrorMessage);

        try
        {
            var columnNamesSet = columns
                .Select(c => c.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var validData = dto.Data
                .Where(kvp => columnNamesSet.Contains(kvp.Key))
                .Where(kvp => kvp.Value != null && !string.IsNullOrWhiteSpace(kvp.Value.ToString()))
                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value, StringComparer.OrdinalIgnoreCase);

            var rootTable = path.First();
            var rootPhysicalName = _dynamicTableService.GetPhysicalTableName(rootTable.Id);
            var rootColumns = rootTable.Columns
                .Where(c => validData.ContainsKey(c.Name))
                .OrderBy(c => c.SortOrder)
                .ThenBy(c => c.Id)
                .ToList();

            var rootColumnNames = string.Join(", ", rootColumns.Select(c => $"[{c.Name}]"));
            var rootColumnValues = string.Join(", ", rootColumns.Select(c => FormatSqlValue(validData[c.Name])));
            var insertRootSql = rootColumns.Any()
                ? $@"INSERT INTO [{rootPhysicalName}] ({rootColumnNames}, CreatedAt, UpdatedAt) VALUES ({rootColumnValues}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                : $@"INSERT INTO [{rootPhysicalName}] (CreatedAt, UpdatedAt) VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = insertRootSql;
                await command.ExecuteNonQueryAsync();
            }

            using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT last_insert_rowid()";
                var result = await command.ExecuteScalarAsync();
                if (result == null || result == DBNull.Value)
                    return StatusCode(500, "Failed to get inserted record ID");

                var recordId = (long)result;
                var recordIdValue = recordId.ToString();

                for (var pathIndex = 1; pathIndex < path.Count; pathIndex++)
                {
                    var currentTable = path[pathIndex];
                    var physicalTableName = _dynamicTableService.GetPhysicalTableName(currentTable.Id);
                    var currentColumns = currentTable.Columns
                        .Where(c => validData.ContainsKey(c.Name))
                        .OrderBy(c => c.SortOrder)
                        .ThenBy(c => c.Id)
                        .ToList();

                    var insertColumns = new List<string> { "Id" };
                    var insertValues = new List<string> { recordIdValue };

                    if (currentColumns.Any())
                    {
                        insertColumns.AddRange(currentColumns.Select(c => $"[{c.Name}]"));
                        insertValues.AddRange(currentColumns.Select(c => FormatSqlValue(validData[c.Name])));
                    }

                    insertColumns.AddRange(new[] { "CreatedAt", "UpdatedAt" });
                    insertValues.AddRange(new[] { "CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP" });

                    var insertSql = $@"INSERT INTO [{physicalTableName}] ({string.Join(", ", insertColumns)}) VALUES ({string.Join(", ", insertValues)})";
                    using var insertCommand = connection.CreateCommand();
                    insertCommand.CommandText = insertSql;
                    await insertCommand.ExecuteNonQueryAsync();
                }

                var getRecordResult = await GetRecord(tableId, (int)recordId);
                if (getRecordResult.Result is OkObjectResult okResult && okResult.Value is RecordDto createdRecord)
                {
                    return CreatedAtAction(nameof(GetRecord), new { tableId, recordId }, createdRecord);
                }

                return CreatedAtAction(nameof(GetRecord), new { tableId, recordId }, new RecordDto { Id = (int)recordId });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error creating record in table {tableId}");
            return StatusCode(500, "Error creating record");
        }
    }

    /// Update a record
    [HttpPut("{recordId}")]
    [Permission("records.edit")]
    public async Task<IActionResult> UpdateRecord(int tableId, int recordId, [FromBody] UpdateRecordDto dto)
    {
        var table = await _context.Tables
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!await _dynamicTableService.IsPhysicalTableCreatedAsync(tableId))
            return BadRequest("Physical table does not exist");

        var path = await _dynamicTableService.GetTablePathAsync(tableId);
        var columns = await _dynamicTableService.GetEffectiveColumnsAsync(tableId);
        var validationResult = ValidateRecordData(dto.Data, columns, requireMissingRequiredFields: false);
        if (!validationResult.IsValid)
            return BadRequest(validationResult.ErrorMessage);

        try
        {
            var columnNamesSet = columns
                .Select(c => c.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var validData = dto.Data
                .Where(kvp => columnNamesSet.Contains(kvp.Key))
                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value, StringComparer.OrdinalIgnoreCase);

            var columnsByTable = columns
                .GroupBy(c => c.TableId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            foreach (var tableEntry in columnsByTable)
            {
                var tableColumns = tableEntry.Value
                    .Where(c => validData.ContainsKey(c.Name))
                    .ToList();

                if (!tableColumns.Any() && tableEntry.Key != tableId)
                    continue;

                var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableEntry.Key);
                var setClause = tableColumns.Any()
                    ? $"{string.Join(", ", tableColumns.Select(c => $"[{c.Name}] = {FormatSqlValue(validData[c.Name])}"))}, UpdatedAt = CURRENT_TIMESTAMP"
                    : "UpdatedAt = CURRENT_TIMESTAMP";

                var sql = $@"
                    UPDATE [{physicalTableName}]
                    SET {setClause}
                    WHERE Id = {recordId}";

                using var command = connection.CreateCommand();
                command.CommandText = sql;
                await command.ExecuteNonQueryAsync();
            }

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error updating record {recordId} in table {tableId}");
            return StatusCode(500, "Error updating record");
        }
    }

    /// Delete a record
    [HttpDelete("{recordId}")]
    [Permission("records.delete")]
    public async Task<IActionResult> DeleteRecord(int tableId, int recordId)
    {
        var table = await _context.Tables.FindAsync(tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!await _dynamicTableService.IsPhysicalTableCreatedAsync(tableId))
            return NotFound("Record not found");

        try
        {
            var path = await _dynamicTableService.GetTablePathAsync(tableId);
            var rootPhysicalTableName = _dynamicTableService.GetPhysicalTableName(path.First().Id);
            var sql = $"DELETE FROM [{rootPhysicalTableName}] WHERE Id = {recordId}";

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                await command.ExecuteNonQueryAsync();
            }

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error deleting record {recordId} from table {tableId}");
            return StatusCode(500, "Error deleting record");
        }
    }

    /// Bulk delete records
    [HttpPost("bulk-delete")]
    [Permission("records.delete")]
    public async Task<IActionResult> BulkDeleteRecords(int tableId, [FromBody] BulkDeleteDto dto)
    {
        var table = await _context.Tables.FindAsync(tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!await _dynamicTableService.IsPhysicalTableCreatedAsync(tableId))
            return Ok(new { deletedCount = 0 });

        try
        {
            var path = await _dynamicTableService.GetTablePathAsync(tableId);
            var rootPhysicalTableName = _dynamicTableService.GetPhysicalTableName(path.First().Id);
            var idList = string.Join(", ", dto.RecordIds);

            var sql = $"DELETE FROM [{rootPhysicalTableName}] WHERE Id IN ({idList})";

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                await command.ExecuteNonQueryAsync();
            }

            return Ok(new { deletedCount = dto.RecordIds.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error bulk deleting records from table {tableId}");
            return StatusCode(500, "Error deleting records");
        }
    }

    // Helper methods
    private static string BuildSelectColumnList(IEnumerable<Column> columns, IReadOnlyList<Table> path)
    {
        var aliasMap = path.Select((t, index) => (t.Id, Alias: $"t{index}"))
            .ToDictionary(x => x.Id, x => x.Alias);

        var columnList = string.Join(", ", columns.Select(c => $"{aliasMap[c.TableId]}.[{c.Name}]"));
        return string.IsNullOrWhiteSpace(columnList) ? string.Empty : $", {columnList}";
    }

    private string BuildFromClause(IReadOnlyList<Table> path)
    {
        var builder = new StringBuilder();
        builder.Append($"FROM [{_dynamicTableService.GetPhysicalTableName(path[0].Id)}] AS t0");

        for (var i = 1; i < path.Count; i++)
        {
            builder.Append($" INNER JOIN [{_dynamicTableService.GetPhysicalTableName(path[i].Id)}] AS t{i} ON t{i}.Id = t{i - 1}.Id");
        }

        return builder.ToString();
    }

    private static string BuildFilterWhereClause(
        IEnumerable<Column> columns,
        IReadOnlyList<Table> path,
        string? filterField,
        string? filterValue)
    {
        if (string.IsNullOrWhiteSpace(filterField) || string.IsNullOrWhiteSpace(filterValue))
            return string.Empty;

        var column = columns.FirstOrDefault(c => string.Equals(c.Name, filterField, StringComparison.OrdinalIgnoreCase));
        if (column == null)
            return string.Empty;

        var tableIndex = path.ToList().FindIndex(t => t.Id == column.TableId);
        if (tableIndex < 0)
            return string.Empty;

        var escapedValue = filterValue.Replace("'", "''");
        return $"WHERE t{tableIndex}.[{column.Name}] = '{escapedValue}'";
    }

    private RecordDto ReadRecordDto(System.Data.IDataReader reader)
    {
        var data = new Dictionary<string, object>();
        var id = reader.GetInt32(0);
        var createdAtOrdinal = reader.FieldCount - 2;
        var updatedAtOrdinal = reader.FieldCount - 1;

        for (int i = 1; i < reader.FieldCount - 2; i++)
        {
            var columnName = reader.GetName(i);
            var value = reader.IsDBNull(i) ? null : reader.GetValue(i);
            data[columnName] = value ?? "";
        }

        return new RecordDto
        {
            Id = id,
            Data = data,
            CreatedAt = reader.IsDBNull(createdAtOrdinal) ? DateTime.UtcNow : reader.GetDateTime(createdAtOrdinal),
            UpdatedAt = reader.IsDBNull(updatedAtOrdinal) ? DateTime.UtcNow : reader.GetDateTime(updatedAtOrdinal)
        };
    }

    private (bool IsValid, string ErrorMessage) ValidateRecordData(
        Dictionary<string, object> data,
        IEnumerable<Column> columns,
        bool requireMissingRequiredFields)
    {
        var columnList = columns.ToList();

        foreach (var kvp in data)
        {
            var column = columnList.FirstOrDefault(c => string.Equals(c.Name, kvp.Key, StringComparison.OrdinalIgnoreCase));
            if (column == null)
                return (false, $"Column '{kvp.Key}' does not exist on this table");

            if (column.IsRequired && (kvp.Value == null || string.IsNullOrWhiteSpace(kvp.Value.ToString())))
                return (false, $"Column '{kvp.Key}' is required");
        }

        if (requireMissingRequiredFields)
        {
            foreach (var column in columnList.Where(c => c.IsRequired))
            {
                var suppliedValue = data
                    .FirstOrDefault(kvp => string.Equals(kvp.Key, column.Name, StringComparison.OrdinalIgnoreCase))
                    .Value;

                if (suppliedValue == null ||
                    string.IsNullOrWhiteSpace(suppliedValue.ToString()))
                {
                    return (false, $"Column '{column.Name}' is required");
                }
            }
        }

        return (true, "");
    }

    private string FormatSqlValue(object? value)
    {
        if (value == null)
            return "NULL";

        // Handle JSON/list values
        if (value is System.Text.Json.JsonElement jsonElement)
        {
            return jsonElement.ValueKind switch
            {
                System.Text.Json.JsonValueKind.Array => $"'{jsonElement.ToString()?.Replace("'", "''")}'",
                System.Text.Json.JsonValueKind.String => $"'{jsonElement.GetString()?.Replace("'", "''")}'",
                System.Text.Json.JsonValueKind.True => "1",
                System.Text.Json.JsonValueKind.False => "0",
                _ => $"'{jsonElement.ToString()?.Replace("'", "''")}'"
            };
        }

        return value switch
        {
            string s => $"'{s.Replace("'", "''")}'",
            bool b => b ? "1" : "0",
            IEnumerable<string> list => $"'{System.Text.Json.JsonSerializer.Serialize(list).Replace("'", "''")}'",
            _ => value.ToString()!
        };
    }
}

// DTOs for Records
public class RecordDto
{
    public int Id { get; set; }
    public Dictionary<string, object> Data { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateRecordDto
{
    public required Dictionary<string, object> Data { get; set; }
}

public class UpdateRecordDto
{
    public required Dictionary<string, object> Data { get; set; }
}

public class BulkDeleteDto
{
    public required List<int> RecordIds { get; set; }
}
