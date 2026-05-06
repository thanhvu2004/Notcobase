namespace notcobase.Models;

/// <summary>
/// Represents a record (row) in a table
/// </summary>
public class Record
{
    public int Id { get; set; }
    public int TableId { get; set; }
    public required string Data { get; set; } // JSON string storing the actual data
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public Table? Table { get; set; }
}
