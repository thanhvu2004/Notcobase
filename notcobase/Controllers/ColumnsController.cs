using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;
using notcobase.Services;

namespace notcobase.Controllers;

[ApiController]
[Route("api/tables/{tableId}/[controller]")]
[Authorize]
public class ColumnsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly DynamicTableService _dynamicTableService;
    private readonly ILogger<ColumnsController> _logger;

    public ColumnsController(AppDbContext context, DynamicTableService dynamicTableService, ILogger<ColumnsController> logger)
    {
        _context = context;
        _dynamicTableService = dynamicTableService;
        _logger = logger;
    }

    /// Get all columns for a table
    [HttpGet]
    // [Permission("columns.view")]
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

        // If this is the first column and the table doesn't have a physical table yet, create it
        if (!table.PhysicalTableCreated && table.Columns.Count == 1)
        {
            try
            {
                await _dynamicTableService.CreatePhysicalTableAsync(tableId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error creating physical table for table ID {tableId}");
                // Don't fail the request, but log the error
                // The user can retry creating records later
            }
        }
        // If physical table already exists, add this column to it
        else if (table.PhysicalTableCreated)
        {
            try
            {
                await _dynamicTableService.AddColumnAsync(column);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error adding column to physical table for table ID {tableId}");
                return StatusCode(500, "Error adding column to physical table");
            }
        }

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

        _context.Columns.Update(column);
        await _context.SaveChangesAsync();


        // Sync physical table changes
        var tablePhys = await _context.Tables.FindAsync(tableId);

        if (tablePhys != null && tablePhys.PhysicalTableCreated)
        {
            try
            {
                // Handle column rename
                if (nameChanged)
                {
                    var physicalTableName = $"tbl_{tableId}";

                    await _context.Database.ExecuteSqlRawAsync($@"
                        ALTER TABLE [{physicalTableName}]
                        RENAME COLUMN [{oldName}] TO [{column.Name}]");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error updating physical column for table ID {tableId}");
                return StatusCode(500, "Error updating physical table column");
            }
        }

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

        var table = await _context.Tables.FindAsync(tableId);
        if (table == null)
            return NotFound();

        _context.Columns.Remove(column);
        await _context.SaveChangesAsync();

        // Drop the column from physical table if it exists
        if (table.PhysicalTableCreated)
        {
            try
            {
                await _dynamicTableService.DropColumnAsync(tableId, column.Name);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error dropping column from physical table for table ID {tableId}");
                // Don't fail the request, column is already deleted from metadata
            }
        }

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
