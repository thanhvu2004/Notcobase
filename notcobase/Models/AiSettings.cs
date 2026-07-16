namespace notcobase.Models;

public class AiSettings
{
    public int Id { get; set; }
    public string Provider { get; set; } = "ollama";
    public string Model { get; set; } = "llama3.1:8b";
    public string BaseUrl { get; set; } = "http://127.0.0.1:11434";
    public string? ApiKey { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
