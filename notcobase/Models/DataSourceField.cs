namespace notcobase.Models;

public class DataSourceField
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public required string FieldName { get; set; }
    public required string FieldType { get; set; }
    public bool IsNullable { get; set; } = true;
    public bool IsPrimaryKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DataSource? DataSource { get; set; }
}
