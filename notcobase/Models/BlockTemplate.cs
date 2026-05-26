namespace notcobase.Models;

public class BlockTemplate
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Type { get; set; }
    public required string SchemaJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
