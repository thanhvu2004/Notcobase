using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TablesController : ControllerBase
{
    private readonly AppDbContext _context;

    public TablesController(AppDbContext context)
    {
        _context = context;
    }

    /// Get all tables
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TableDto>>> GetTables()
    {
        var tables = await _context.Tables
            .Include(t => t.Columns)
            .Select(t => new TableDto
            {
                Id = t.Id,
                Name = t.Name,
                Description = t.Description,
                ColumnCount = t.Columns.Count,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt
            })
            .ToListAsync();

        return Ok(tables);
    }

    /// Get a specific table by ID
    [HttpGet("{id}")]
    public async Task<ActionResult<TableDetailsDto>> GetTable(int id)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .Include(t => t.Records)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (table == null)
            return NotFound();

        var dto = new TableDetailsDto
        {
            Id = table.Id,
            Name = table.Name,
            Description = table.Description,
            Columns = table.Columns.Select(c => new ColumnDto
            {
                Id = c.Id,
                Name = c.Name,
                FieldType = c.FieldType,
                IsRequired = c.IsRequired
            }).ToList(),
            RecordCount = table.Records.Count,
            CreatedAt = table.CreatedAt,
            UpdatedAt = table.UpdatedAt
        };

        return Ok(dto);
    }

    /// Create a new table
    [HttpPost]
    public async Task<ActionResult<TableDto>> CreateTable([FromBody] CreateTableDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Table name is required");

        var table = new Table { Name = dto.Name, Description = dto.Description };
        _context.Tables.Add(table);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTable), new { id = table.Id }, new TableDto
        {
            Id = table.Id,
            Name = table.Name,
            Description = table.Description,
            ColumnCount = 0,
            CreatedAt = table.CreatedAt,
            UpdatedAt = table.UpdatedAt
        });
    }

    /// Update a table
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateTable(int id, [FromBody] UpdateTableDto dto)
    {
        var table = await _context.Tables.FindAsync(id);
        if (table == null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.Name))
            table.Name = dto.Name;

        if (dto.Description != null)
            table.Description = dto.Description;

        table.UpdatedAt = DateTime.UtcNow;
        _context.Tables.Update(table);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// Delete a table
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTable(int id)
    {
        var table = await _context.Tables.FindAsync(id);
        if (table == null)
            return NotFound();

        _context.Tables.Remove(table);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}

// DTOs for Tables
public class TableDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int ColumnCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class TableDetailsDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<ColumnDto> Columns { get; set; } = new();
    public int RecordCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateTableDto
{
    public required string Name { get; set; }
    public string? Description { get; set; }
}

public class UpdateTableDto
{
    public string? Name { get; set; }
    public string? Description { get; set; }
}

public class ColumnDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
}
