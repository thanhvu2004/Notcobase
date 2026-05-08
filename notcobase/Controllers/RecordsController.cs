using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;
using System.Text.Json;

namespace notcobase.Controllers;

[ApiController]
[Route("api/tables/{tableId}/[controller]")]
[Authorize]
public class RecordsController : ControllerBase
{
    private readonly AppDbContext _context;

    public RecordsController(AppDbContext context)
    {
        _context = context;
    }

    /// Get all records from a table
    [HttpGet]
    [Permission("records.view")]
    public ActionResult<IEnumerable<RecordDto>> GetRecords(int tableId, [FromQuery] int? skip = 0, [FromQuery] int? limit = 100)
    {
        // Verify table exists
        var tableExists = _context.Tables.Any(t => t.Id == tableId);
        if (!tableExists)
            return NotFound("Table not found");

        var skipValue = skip ?? 0;
        var limitValue = limit ?? 100;

        var records = _context.Records
            .Where(r => r.TableId == tableId)
            .OrderByDescending(r => r.CreatedAt)
            .Skip(skipValue)
            .Take(limitValue)
            .AsEnumerable()
            .Select(r => new RecordDto
            {
                Id = r.Id,
                Data = JsonSerializer.Deserialize<Dictionary<string, object>>(r.Data) ?? new(),
                CreatedAt = r.CreatedAt,
                UpdatedAt = r.UpdatedAt
            })
            .ToList();

        return Ok(records);
    }

    /// Get a specific record
    [HttpGet("{recordId}")]
    [Permission("records.view")]
    public ActionResult<RecordDto> GetRecord(int tableId, int recordId)
    {
        var record = _context.Records
            .FirstOrDefault(r => r.Id == recordId && r.TableId == tableId);

        if (record == null)
            return NotFound();

        var dto = new RecordDto
        {
            Id = record.Id,
            Data = JsonSerializer.Deserialize<Dictionary<string, object>>(record.Data) ?? new(),
            CreatedAt = record.CreatedAt,
            UpdatedAt = record.UpdatedAt
        };

        return Ok(dto);
    }

    /// Create a new record
    [HttpPost]
    [Permission("records.create")]
    public async Task<ActionResult<RecordDto>> CreateRecord(int tableId, [FromBody] CreateRecordDto dto)
    {
        // Verify table exists
        var table = await _context.Tables.FindAsync(tableId);
        if (table == null)
            return NotFound("Table not found");

        var record = new Record
        {
            TableId = tableId,
            Data = JsonSerializer.Serialize(dto.Data)
        };

        _context.Records.Add(record);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetRecord), new { tableId, recordId = record.Id }, new RecordDto
        {
            Id = record.Id,
            Data = dto.Data,
            CreatedAt = record.CreatedAt,
            UpdatedAt = record.UpdatedAt
        });
    }

    /// Update a record
    [HttpPut("{recordId}")]
    [Permission("records.edit")]
    public async Task<IActionResult> UpdateRecord(int tableId, int recordId, [FromBody] UpdateRecordDto dto)
    {
        var record = await _context.Records
            .FirstOrDefaultAsync(r => r.Id == recordId && r.TableId == tableId);

        if (record == null)
            return NotFound();

        record.Data = JsonSerializer.Serialize(dto.Data);
        record.UpdatedAt = DateTime.UtcNow;

        _context.Records.Update(record);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// Delete a record
    [HttpDelete("{recordId}")]
    [Permission("records.delete")]
    public async Task<IActionResult> DeleteRecord(int tableId, int recordId)
    {
        var record = await _context.Records
            .FirstOrDefaultAsync(r => r.Id == recordId && r.TableId == tableId);

        if (record == null)
            return NotFound();

        _context.Records.Remove(record);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    
    /// Bulk delete records
    
    [HttpPost("bulk-delete")]
    [Permission("records.delete")]
    public async Task<IActionResult> BulkDeleteRecords(int tableId, [FromBody] BulkDeleteDto dto)
    {
        var records = await _context.Records
            .Where(r => r.TableId == tableId && dto.RecordIds.Contains(r.Id))
            .ToListAsync();

        _context.Records.RemoveRange(records);
        await _context.SaveChangesAsync();

        return Ok(new { deletedCount = records.Count });
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
