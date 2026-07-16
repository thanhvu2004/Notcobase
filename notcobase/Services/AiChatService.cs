using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Services;

public class AiChatService
{
    private const string DefaultProvider = "ollama";
    private const string DefaultModel = "llama3.1:8b";
    private const string DefaultOllamaUrl = "http://127.0.0.1:11434";
    private const string DefaultOpenAiCompatibleUrl = "https://api.openai.com/v1";
    private const string DefaultGeminiUrl = "https://generativelanguage.googleapis.com/v1beta";
    private const string DefaultGeminiModel = "gemini-2.0-flash";

    private readonly AppDbContext _context;
    private readonly HttpClient _httpClient;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<AiChatService> _logger;
    private IReadOnlyList<DocumentationChunk>? _documents;

    public AiChatService(
        AppDbContext context,
        HttpClient httpClient,
        IWebHostEnvironment environment,
        ILogger<AiChatService> logger)
    {
        _context = context;
        _httpClient = httpClient;
        _environment = environment;
        _logger = logger;
    }

    public async Task<AiSettings> GetOrCreateSettingsAsync()
    {
        var settings = await _context.AiSettings.FirstOrDefaultAsync(s => s.Id == 1);
        if (settings != null)
        {
            return settings;
        }

        settings = new AiSettings { Id = 1 };
        _context.AiSettings.Add(settings);
        await _context.SaveChangesAsync();
        return settings;
    }

    public async Task<AiSettings> UpdateSettingsAsync(AiSettingsUpdate update)
    {
        var settings = await GetOrCreateSettingsAsync();
        var provider = NormalizeProvider(update.Provider);

        settings.Provider = provider;
        settings.Model = NormalizeModel(provider, update.Model);
        settings.BaseUrl = NormalizeBaseUrl(provider, update.BaseUrl);

        if (update.ApiKey != null)
        {
            settings.ApiKey = string.IsNullOrWhiteSpace(update.ApiKey) ? null : update.ApiKey.Trim();
        }

        settings.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return settings;
    }

    public async Task<AiChatResult> ChatAsync(AiChatRequest request)
    {
        var question = (request.Message ?? "").Trim();
        if (string.IsNullOrWhiteSpace(question))
        {
            throw new InvalidOperationException("Message is required.");
        }

        var language = NormalizeLanguage(request.Language);
        var settings = await GetOrCreateSettingsAsync();
        var contextChunks = RetrieveContext(LoadDocuments(), question, language);
        var messages = BuildMessages(question, request.History ?? new List<AiChatMessage>(), contextChunks, language);
        var answer = await RunProviderChatAsync(messages, settings);

        return new AiChatResult
        {
            Answer = answer,
            Language = language,
            Provider = settings.Provider,
            Model = settings.Model,
            Sources = contextChunks
                .Select(chunk => new AiChatSource { Source = chunk.Source, Heading = chunk.Heading })
                .ToList()
        };
    }

    private async Task<string> RunProviderChatAsync(List<ProviderMessage> messages, AiSettings settings)
    {
        return settings.Provider switch
        {
            "openai-compatible" => await OpenAiCompatibleChatAsync(messages, settings),
            "gemini" => await GeminiChatAsync(messages, settings),
            _ => await OllamaChatAsync(messages, settings)
        };
    }

    private async Task<string> OllamaChatAsync(List<ProviderMessage> messages, AiSettings settings)
    {
        var payload = new
        {
            model = settings.Model,
            messages,
            stream = false,
            options = new { temperature = 0.2 }
        };

        using var response = await _httpClient.PostAsJsonAsync($"{settings.BaseUrl.TrimEnd('/')}/api/chat", payload);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Ollama returned HTTP {(int)response.StatusCode}: {body}");
        }

        using var document = JsonDocument.Parse(body);
        var content = document.RootElement.GetProperty("message").GetProperty("content").GetString();
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Ollama returned an empty response.");
        }

        return content;
    }

    private async Task<string> OpenAiCompatibleChatAsync(List<ProviderMessage> messages, AiSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            throw new InvalidOperationException("API key is required for OpenAI-compatible providers.");
        }

        var payload = new
        {
            model = settings.Model,
            messages,
            temperature = 0.2
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{settings.BaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);

        using var response = await _httpClient.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"AI provider returned HTTP {(int)response.StatusCode}: {body}");
        }

        using var document = JsonDocument.Parse(body);
        var content = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("AI provider returned an empty response.");
        }

        return content;
    }

    private async Task<string> GeminiChatAsync(List<ProviderMessage> messages, AiSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            throw new InvalidOperationException("Gemini API key is required.");
        }

        var systemText = string.Join("\n\n", messages
            .Where(message => message.Role == "system" && !string.IsNullOrWhiteSpace(message.Content))
            .Select(message => message.Content));

        var contents = messages
            .Where(message => message.Role != "system" && !string.IsNullOrWhiteSpace(message.Content))
            .Select(message => new
            {
                role = message.Role == "assistant" ? "model" : "user",
                parts = new[] { new { text = message.Content } }
            })
            .ToList();

        var payload = new Dictionary<string, object?>
        {
            ["contents"] = contents,
            ["generationConfig"] = new { temperature = 0.2 }
        };
        if (!string.IsNullOrWhiteSpace(systemText))
        {
            payload["systemInstruction"] = new { parts = new[] { new { text = systemText } } };
        }

        var modelName = settings.Model.StartsWith("models/", StringComparison.OrdinalIgnoreCase)
            ? settings.Model
            : $"models/{settings.Model}";
        using var response = await _httpClient.PostAsJsonAsync(
            $"{settings.BaseUrl.TrimEnd('/')}/{modelName}:generateContent?key={Uri.EscapeDataString(settings.ApiKey)}",
            payload);

        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Gemini returned HTTP {(int)response.StatusCode}: {body}");
        }

        using var document = JsonDocument.Parse(body);
        var parts = document.RootElement
            .GetProperty("candidates")[0]
            .GetProperty("content")
            .GetProperty("parts")
            .EnumerateArray();
        var content = string.Join("\n", parts.Select(part => part.GetProperty("text").GetString())).Trim();

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Gemini returned an empty response.");
        }

        return content;
    }

    private IReadOnlyList<DocumentationChunk> LoadDocuments()
    {
        if (_documents != null)
        {
            return _documents;
        }

        var docsPath = Path.Combine(AppContext.BaseDirectory, "ai", "docs");
        if (!Directory.Exists(docsPath))
        {
            docsPath = Path.GetFullPath(Path.Combine(_environment.ContentRootPath, "..", "ai", "docs"));
        }

        if (!Directory.Exists(docsPath))
        {
            _logger.LogWarning("AI documentation directory not found.");
            _documents = Array.Empty<DocumentationChunk>();
            return _documents;
        }

        _documents = Directory
            .EnumerateFiles(docsPath, "*.md", SearchOption.AllDirectories)
            .OrderBy(path => path)
            .SelectMany(path => ChunkDocument(docsPath, path, File.ReadAllText(path)))
            .ToList();

        return _documents;
    }

    private static IEnumerable<DocumentationChunk> ChunkDocument(string docsPath, string path, string text, int maxChars = 1800)
    {
        var relativePath = Path.GetRelativePath(Path.GetDirectoryName(docsPath) ?? docsPath, path)
            .Replace(Path.DirectorySeparatorChar, '/');
        var heading = Path.GetFileNameWithoutExtension(path);
        var current = new List<string>();
        var currentLength = 0;

        foreach (var line in text.Split('\n'))
        {
            var normalizedLine = line.TrimEnd('\r');
            if (normalizedLine.StartsWith("#", StringComparison.Ordinal))
            {
                heading = normalizedLine.TrimStart('#').Trim();
            }

            var nextLength = normalizedLine.Length + 1;
            if (current.Count > 0 && currentLength + nextLength > maxChars)
            {
                yield return new DocumentationChunk(relativePath, heading, string.Join("\n", current).Trim());
                current.Clear();
                currentLength = 0;
            }

            current.Add(normalizedLine);
            currentLength += nextLength;
        }

        if (current.Count > 0)
        {
            yield return new DocumentationChunk(relativePath, heading, string.Join("\n", current).Trim());
        }
    }

    private static IReadOnlyList<DocumentationChunk> RetrieveContext(
        IReadOnlyList<DocumentationChunk> documents,
        string question,
        string language,
        int limit = 5)
    {
        var queryTerms = Tokenize(question);
        if (queryTerms.Count == 0)
        {
            return Array.Empty<DocumentationChunk>();
        }

        return documents
            .Select(document =>
            {
                var overlap = queryTerms.Intersect(Tokenize($"{document.Heading} {document.Text}")).Count();
                var languageBoost = language == "vi" && document.Source.EndsWith(".vi.md", StringComparison.OrdinalIgnoreCase)
                    ? 2
                    : language == "en" && !document.Source.EndsWith(".vi.md", StringComparison.OrdinalIgnoreCase)
                        ? 2
                        : 0;
                return new { Score = overlap + languageBoost, Document = document };
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .Take(limit)
            .Select(item => item.Document)
            .ToList();
    }

    private static HashSet<string> Tokenize(string text)
    {
        return Regex
            .Matches(text.ToLowerInvariant(), @"[\w.:-]+")
            .Select(match => match.Value)
            .ToHashSet();
    }

    private static List<ProviderMessage> BuildMessages(
        string question,
        IReadOnlyList<AiChatMessage> history,
        IReadOnlyList<DocumentationChunk> contextChunks,
        string language)
    {
        var context = string.Join("\n\n", contextChunks.Select(chunk =>
            $"Source: {chunk.Source} > {chunk.Heading}\n{chunk.Text}"));
        var responseLanguage = language == "vi" ? "Vietnamese" : "English";
        var systemPrompt =
            "You are the Notcobase support assistant. Help users use the product: " +
            "tables, fields, records, users, roles, permissions, custom pages, and the UI editor. " +
            "Answer with concise, practical steps. Mention required permissions when relevant. " +
            $"Always answer in {responseLanguage}. " +
            "Use the retrieved documentation as your source of truth. If the docs do not cover the " +
            "question, say what you can infer and ask for more details.\n\n" +
            $"Retrieved documentation:\n{(string.IsNullOrWhiteSpace(context) ? "No matching documentation was found." : context)}";

        var messages = new List<ProviderMessage> { new("system", systemPrompt) };
        messages.AddRange(history
            .Where(item => (item.Role == "user" || item.Role == "assistant") && !string.IsNullOrWhiteSpace(item.Content))
            .TakeLast(8)
            .Select(item => new ProviderMessage(item.Role, item.Content.Trim())));
        messages.Add(new ProviderMessage("user", question));
        return messages;
    }

    private static string NormalizeProvider(string? value)
    {
        var lowered = (value ?? "").Trim().ToLowerInvariant();
        return lowered is "ollama" or "openai-compatible" or "gemini" ? lowered : DefaultProvider;
    }

    private static string NormalizeLanguage(string? value)
    {
        var lowered = (value ?? "").Trim().ToLowerInvariant();
        if (lowered == "vn")
        {
            return "vi";
        }

        return lowered is "en" or "vi" ? lowered : "en";
    }

    private static string NormalizeModel(string provider, string? value)
    {
        var model = (value ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(model))
        {
            return model;
        }

        return provider == "gemini" ? DefaultGeminiModel : DefaultModel;
    }

    private static string NormalizeBaseUrl(string provider, string? value)
    {
        var baseUrl = (value ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(baseUrl))
        {
            return baseUrl;
        }

        return provider switch
        {
            "openai-compatible" => DefaultOpenAiCompatibleUrl,
            "gemini" => DefaultGeminiUrl,
            _ => DefaultOllamaUrl
        };
    }
}

public record AiSettingsUpdate(string? Provider, string? Model, string? BaseUrl, string? ApiKey);
public record AiChatMessage(string Role, string Content);
public record ProviderMessage(string Role, string Content);
public record DocumentationChunk(string Source, string Heading, string Text);

public class AiChatRequest
{
    public string Message { get; set; } = "";
    public string Language { get; set; } = "en";
    public List<AiChatMessage> History { get; set; } = new();
}

public class AiChatResult
{
    public string Answer { get; set; } = "";
    public string Language { get; set; } = "en";
    public string Provider { get; set; } = "ollama";
    public string Model { get; set; } = "";
    public List<AiChatSource> Sources { get; set; } = new();
}

public class AiChatSource
{
    public string Source { get; set; } = "";
    public string Heading { get; set; } = "";
}
