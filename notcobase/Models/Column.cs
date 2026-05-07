namespace notcobase.Models;

/// Represents a column definition in a table
public class Column
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string FieldType { get; set; } // "text", "number", "date", "boolean", etc.
    public int TableId { get; set; }
    public bool IsRequired { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public Table? Table { get; set; }
}
