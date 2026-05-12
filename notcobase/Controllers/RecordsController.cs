using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;
using notcobase.Services;
using System.Data;

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
    // [Permission("records.view")]
    public async Task<ActionResult<IEnumerable<RecordDto>>> GetRecords(int tableId, [FromQuery] int? skip = 0, [FromQuery] int? limit = 100)
    {
        // Verify table exists and physical table is created
        var table = await _context.Tables
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!table.PhysicalTableCreated)
            return Ok(new List<RecordDto>()); // No records if table not yet created

        try
        {
            var skipValue = skip ?? 0;
            var limitValue = limit ?? 100;

            var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableId);
            var columnList = string.Join(", ", table.Columns.Select(c => $"[{c.Name}]"));

            var sql = $@"
                SELECT Id, {columnList}, CreatedAt, UpdatedAt
                FROM [{physicalTableName}]
                ORDER BY CreatedAt DESC
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
                        var dto = ReadRecordDto(reader, table.Columns);
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
    // [Permission("records.view")]
    public async Task<ActionResult<RecordDto>> GetRecord(int tableId, int recordId)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!table.PhysicalTableCreated)
            return NotFound("Record not found");

        try
        {
            var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableId);
            var columnList = string.Join(", ", table.Columns.Select(c => $"[{c.Name}]"));

            var sql = $@"
                SELECT Id, {columnList}, CreatedAt, UpdatedAt
                FROM [{physicalTableName}]
                WHERE Id = {recordId}";

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                using (var reader = await command.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        var dto = ReadRecordDto(reader, table.Columns);
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
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!table.PhysicalTableCreated)
            return BadRequest("Physical table has not been created yet. Please add columns first.");

        // Validate data against columns
        var validationResult = ValidateRecordData(dto.Data, table.Columns);
        if (!validationResult.IsValid)
            return BadRequest(validationResult.ErrorMessage);

        try
        {
            var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableId);

            var validData = dto.Data
                .Where(kvp => kvp.Value != null && !string.IsNullOrWhiteSpace(kvp.Value.ToString()))
                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

            var columnNames = string.Join(", ", validData.Keys.Select(k => $"[{k}]"));
            var columnValues = string.Join(", ", validData.Values.Select(v => FormatSqlValue(v)));

            string sql;

            if (validData.Count == 0)
            {
                sql = $@"
                    INSERT INTO [{physicalTableName}] (CreatedAt, UpdatedAt)
                    VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            }
            else
            {
                sql = $@"
                    INSERT INTO [{physicalTableName}] ({columnNames}, CreatedAt, UpdatedAt)
                    VALUES ({columnValues}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            }

            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();

            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                await command.ExecuteNonQueryAsync();
            }

            // Get the last inserted rowid
            using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT last_insert_rowid()";
                var result = await command.ExecuteScalarAsync();
                if (result == null || result == DBNull.Value)
                    return StatusCode(500, "Failed to get inserted record ID");
                
                var recordId = (long)result;

                // Fetch and return the created record
                var getRecordResult = await GetRecord(tableId, (int)recordId);
                return CreatedAtAction(nameof(GetRecord), new { tableId, recordId }, getRecordResult.Result);
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
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (!table.PhysicalTableCreated)
            return BadRequest("Physical table does not exist");

        // Validate data against columns
        var validationResult = ValidateRecordData(dto.Data, table.Columns);
        if (!validationResult.IsValid)
            return BadRequest(validationResult.ErrorMessage);

        try
        {
            var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableId);
            var setClause = string.Join(", ", dto.Data.Select(kvp => $"[{kvp.Key}] = {FormatSqlValue(kvp.Value)}"));

            var sql = $@"
                UPDATE [{physicalTableName}]
                SET {setClause}, UpdatedAt = CURRENT_TIMESTAMP
                WHERE Id = {recordId}";

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

        if (!table.PhysicalTableCreated)
            return NotFound("Record not found");

        try
        {
            var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableId);
            var sql = $"DELETE FROM [{physicalTableName}] WHERE Id = {recordId}";

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

        if (!table.PhysicalTableCreated)
            return Ok(new { deletedCount = 0 });

        try
        {
            var physicalTableName = _dynamicTableService.GetPhysicalTableName(tableId);
            var idList = string.Join(", ", dto.RecordIds);

            var sql = $"DELETE FROM [{physicalTableName}] WHERE Id IN ({idList})";

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
    private RecordDto ReadRecordDto(System.Data.IDataReader reader, ICollection<Column> columns)
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

    private (bool IsValid, string ErrorMessage) ValidateRecordData(Dictionary<string, object> data, ICollection<Column> columns)
    {
        foreach (var kvp in data)
        {
            var column = columns.FirstOrDefault(c => string.Equals(c.Name, kvp.Key, StringComparison.OrdinalIgnoreCase));
            if (column == null)
                return (false, $"Column '{kvp.Key}' does not exist on this table");

            if (column.IsRequired && (kvp.Value == null || string.IsNullOrWhiteSpace(kvp.Value.ToString())))
                return (false, $"Column '{kvp.Key}' is required");
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
