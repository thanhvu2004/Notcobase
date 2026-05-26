namespace notcobase.Models;

public class DataSource
{
    public int Id { get; set; }
    public required string TableName { get; set; }
    public required string DisplayName { get; set; }
    public string? PrimaryKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<DataSourceField> Fields { get; set; } = new List<DataSourceField>();
}
