namespace notcobase.Models;

public class ComponentDefinition
{
    public int Id { get; set; }
    public required string ComponentName { get; set; }
    public required string Category { get; set; }
    public string DefaultPropsJson { get; set; } = "{}";
    public string DefaultSchemaJson { get; set; } = "{}";
    public string? Icon { get; set; }
    public bool CanHaveChildren { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
