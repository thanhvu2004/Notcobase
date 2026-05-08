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
public class ColumnsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ColumnsController(AppDbContext context)
    {
        _context = context;
    }

    /// Get all columns for a table
    [HttpGet]
    [Permission("columns.view")]
    public async Task<ActionResult<IEnumerable<ColumnResponseDto>>> GetColumns(int tableId)
    {
        var table = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        var columns = GetEffectiveColumns(table, tableMap)
            .Select(c => new ColumnResponseDto
            {
                Id = c.Id,
                Name = c.Name,
                FieldType = c.FieldType,
                IsRequired = c.IsRequired,
                TableId = c.TableId,
                IsInherited = c.TableId != tableId,
                CreatedAt = c.CreatedAt
            })
            .ToList();

        return Ok(columns);
    }

    /// Create a new column
    [HttpPost]
    [Permission("columns.create")]
    public async Task<ActionResult<ColumnResponseDto>> CreateColumn(int tableId, [FromBody] CreateColumnDto dto)
    {
        // Verify table exists
        var table = await _context.Tables
            .Include(t => t.Columns)
            .FirstOrDefaultAsync(t => t.Id == tableId);

        if (table == null)
            return NotFound("Table not found");

        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Column name is required");

        if (string.IsNullOrWhiteSpace(dto.FieldType))
            return BadRequest("Field type is required");

        var tableMap = await _context.Tables
            .Include(t => t.Columns)
            .AsNoTracking()
            .ToDictionaryAsync(t => t.Id);

        if (GetEffectiveColumns(table, tableMap)
            .Any(c => string.Equals(c.Name, dto.Name, StringComparison.OrdinalIgnoreCase)))
        {
            return BadRequest("A column with this name already exists on this table or an inherited parent table");
        }

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
            TableId = column.TableId,
            IsInherited = false,
            CreatedAt = column.CreatedAt
        });
    }

    /// Update a column
    [HttpPut("{columnId}")]
    [Permission("columns.edit")]
    public async Task<IActionResult> UpdateColumn(int tableId, int columnId, [FromBody] UpdateColumnDto dto)
    {
        var column = await _context.Columns
            .FirstOrDefaultAsync(c => c.Id == columnId && c.TableId == tableId);

        if (column == null)
            return NotFound();

        var oldName = column.Name;
        var newName = dto.Name?.Trim();
        var nameChanged = !string.IsNullOrWhiteSpace(newName) &&
            !string.Equals(oldName, newName, StringComparison.Ordinal);

        if (!string.IsNullOrWhiteSpace(newName))
        {
            var table = await _context.Tables
                .Include(t => t.Columns)
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tableId);

            if (table == null)
                return NotFound("Table not found");

            var tableMap = await _context.Tables
                .Include(t => t.Columns)
                .AsNoTracking()
                .ToDictionaryAsync(t => t.Id);

            if (GetEffectiveColumns(table, tableMap)
                .Any(c => c.Id != columnId &&
                          string.Equals(c.Name, newName, StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest("A column with this name already exists on this table or an inherited parent table");
            }

            column.Name = newName!;
        }

        if (!string.IsNullOrWhiteSpace(dto.FieldType))
            column.FieldType = dto.FieldType;

        if (dto.IsRequired.HasValue)
            column.IsRequired = dto.IsRequired.Value;

        if (nameChanged)
        {
            var records = await _context.Records
                .Where(r => r.TableId == tableId)
                .ToListAsync();

            foreach (var record in records)
            {
                var data = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(record.Data) ?? new();
                if (!data.TryGetValue(oldName, out var value))
                    continue;

                if (!data.ContainsKey(newName!))
                    data[newName!] = value;

                data.Remove(oldName);
                record.Data = JsonSerializer.Serialize(data);
                record.UpdatedAt = DateTime.UtcNow;
            }
        }

        _context.Columns.Update(column);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// Delete a column
    [HttpDelete("{columnId}")]
    [Permission("columns.delete")]
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
}

// DTOs for Columns
public class ColumnResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
    public int TableId { get; set; }
    public bool IsInherited { get; set; }
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
