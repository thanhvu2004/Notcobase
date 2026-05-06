namespace notcobase.Models;

/// <summary>
/// Represents a database table in the system
/// </summary>
public class Table
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public ICollection<Record> Records { get; set; } = new List<Record>();
    public ICollection<Column> Columns { get; set; } = new List<Column>();
}
