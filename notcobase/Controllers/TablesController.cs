using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TablesController : ControllerBase
{
    private readonly AppDbContext _context;

    public TablesController(AppDbContext context)
    {
        _context = context;
    }

    /// Get all tables
    [HttpGet]
    // [Permission("tables.view")]
    public async Task<ActionResult<IEnumerable<TableDto>>> GetTables()
    {
        var tables = await _context.Tables
            .Include(t => t.Columns)
            .Include(t => t.Records)
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
                RecordCount = t.Records.Count,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt
            })
            .ToList();

        return Ok(dtos);
    }

    /// Get a specific table by ID
    [HttpGet("{id}")]
    // [Permission("tables.view")]
    public async Task<ActionResult<TableDetailsDto>> GetTable(int id)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .Include(t => t.Records)
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
                IsInherited = c.TableId != table.Id
            }).ToList(),
            RecordCount = table.Records.Count,
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
            RecordCount = 0,
            CreatedAt = table.CreatedAt,
            UpdatedAt = table.UpdatedAt
        });
    }

    /// Update a table
    [HttpPut("{id}")]
    [Permission("tables.edit")]
    public async Task<IActionResult> UpdateTable(int id, [FromBody] UpdateTableDto dto)
    {
        var table = await _context.Tables.FindAsync(id);
        if (table == null)
            return NotFound();

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

        table.UpdatedAt = DateTime.UtcNow;
        _context.Tables.Update(table);
        await _context.SaveChangesAsync();

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
    public int RecordCount { get; set; }
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
    public int RecordCount { get; set; }
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
}
