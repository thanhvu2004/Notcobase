using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Controllers;

[ApiController]
[Route("api/tables/{tableId}/[controller]")]
public class ColumnsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ColumnsController(AppDbContext context)
    {
        _context = context;
    }

    /// Get all columns for a table
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ColumnResponseDto>>> GetColumns(int tableId)
    {
        var columns = await _context.Columns
            .Where(c => c.TableId == tableId)
            .OrderBy(c => c.Id)
            .Select(c => new ColumnResponseDto
            {
                Id = c.Id,
                Name = c.Name,
                FieldType = c.FieldType,
                IsRequired = c.IsRequired,
                CreatedAt = c.CreatedAt
            })
            .ToListAsync();

        return Ok(columns);
    }

    /// Create a new column
    [HttpPost]
    public async Task<ActionResult<ColumnResponseDto>> CreateColumn(int tableId, [FromBody] CreateColumnDto dto)
    {
        // Verify table exists
        var table = await _context.Tables.FindAsync(tableId);
        if (table == null)
            return NotFound("Table not found");

        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Column name is required");

        if (string.IsNullOrWhiteSpace(dto.FieldType))
            return BadRequest("Field type is required");

        var column = new Column
        {
            Name = dto.Name,
            FieldType = dto.FieldType,
            TableId = tableId,
            IsRequired = dto.IsRequired
        };

        _context.Columns.Add(column);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetColumns), new { tableId }, new ColumnResponseDto
        {
            Id = column.Id,
            Name = column.Name,
            FieldType = column.FieldType,
            IsRequired = column.IsRequired,
            CreatedAt = column.CreatedAt
        });
    }

    /// Update a column
    [HttpPut("{columnId}")]
    public async Task<IActionResult> UpdateColumn(int tableId, int columnId, [FromBody] UpdateColumnDto dto)
    {
        var column = await _context.Columns
            .FirstOrDefaultAsync(c => c.Id == columnId && c.TableId == tableId);

        if (column == null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.Name))
            column.Name = dto.Name;

        if (!string.IsNullOrWhiteSpace(dto.FieldType))
            column.FieldType = dto.FieldType;

        if (dto.IsRequired.HasValue)
            column.IsRequired = dto.IsRequired.Value;

        _context.Columns.Update(column);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// Delete a column
    [HttpDelete("{columnId}")]
    public async Task<IActionResult> DeleteColumn(int tableId, int columnId)
    {
        var column = await _context.Columns
            .FirstOrDefaultAsync(c => c.Id == columnId && c.TableId == tableId);

        if (column == null)
            return NotFound();

        _context.Columns.Remove(column);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}

// DTOs for Columns
public class ColumnResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateColumnDto
{
    public required string Name { get; set; }
    public required string FieldType { get; set; }
    public bool IsRequired { get; set; }
}

public class UpdateColumnDto
{
    public string? Name { get; set; }
    public string? FieldType { get; set; }
    public bool? IsRequired { get; set; }
}
