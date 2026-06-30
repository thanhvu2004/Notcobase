namespace notcobase.Models;

public class LowCodePage
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Slug { get; set; }
    public string? SectionName { get; set; }
    public string? RequiredPermission { get; set; }
    public required string SchemaJson { get; set; }
    public bool IsPublished { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
