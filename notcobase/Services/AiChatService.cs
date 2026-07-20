using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
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
    private static readonly HashSet<string> SupportedToolNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "create_table",
        "create_column",
        "create_page",
        "add_component_to_page",
        "configure_page_component"
    };

    private readonly AppDbContext _context;
    private readonly HttpClient _httpClient;
    private readonly IWebHostEnvironment _environment;
    private readonly AiAppToolService _toolService;
    private readonly ILogger<AiChatService> _logger;
    private IReadOnlyList<DocumentationChunk>? _documents;

    public AiChatService(
        AppDbContext context,
        HttpClient httpClient,
        IWebHostEnvironment environment,
        AiAppToolService toolService,
        ILogger<AiChatService> logger)
    {
        _context = context;
        _httpClient = httpClient;
        _environment = environment;
        _toolService = toolService;
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

    public async Task<AiChatResult> ChatAsync(AiChatRequest request, ClaimsPrincipal user)
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
        var tools = ShouldOfferTools(question)
            ? _toolService.GetToolDefinitions(user)
            : Array.Empty<object>();
        var chatResponse = await RunProviderChatAsync(messages, settings, tools);
        var toolExecutions = new List<AiToolExecution>();

        if (chatResponse.ToolCalls.Count == 0 && tools.Count > 0)
        {
            chatResponse.ToolCalls = ParseToolCallsFromText(chatResponse.Content ?? "");
        }

        if (chatResponse.ToolCalls.Count > 0)
        {
            messages.Add(new ProviderMessage("assistant", chatResponse.Content ?? "")
            {
                ToolCalls = chatResponse.ToolCalls
            });

            var createdPageIdsByName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var toolCall in chatResponse.ToolCalls.Take(6))
            {
                var arguments = toolCall.Function.Name.Equals("add_component_to_page", StringComparison.OrdinalIgnoreCase)
                    ? ResolveNewPageReference(toolCall.Function.Arguments, createdPageIdsByName)
                    : toolCall.Function.Arguments;
                var execution = await _toolService.ExecuteAsync(
                    toolCall.Function.Name,
                    arguments,
                    user);
                toolExecutions.Add(execution);
                TrackCreatedPage(execution, createdPageIdsByName);
                messages.Add(ProviderMessage.ToolResult(
                    toolCall.Id,
                    JsonSerializer.Serialize(execution)));
            }

            chatResponse = chatResponse.ToolCalls.Any(call => string.IsNullOrWhiteSpace(call.Id) || call.Id.StartsWith("text_call_", StringComparison.Ordinal))
                ? new ProviderChatResponse(BuildFallbackToolAnswer(toolExecutions), new List<ProviderToolCall>())
                : await RunProviderChatAsync(messages, settings, tools);
        }

        return new AiChatResult
        {
            Answer = string.IsNullOrWhiteSpace(chatResponse.Content)
                ? BuildFallbackToolAnswer(toolExecutions)
                : chatResponse.Content,
            Language = language,
            Provider = settings.Provider,
            Model = settings.Model,
            Tools = toolExecutions,
            Sources = contextChunks
                .Select(chunk => new AiChatSource { Source = chunk.Source, Heading = chunk.Heading })
                .ToList()
        };
    }

    private async Task<ProviderChatResponse> RunProviderChatAsync(
        List<ProviderMessage> messages,
        AiSettings settings,
        IReadOnlyList<object> tools)
    {
        return settings.Provider switch
        {
            "openai-compatible" => await OpenAiCompatibleChatAsync(messages, settings, tools),
            "gemini" => await GeminiChatAsync(messages, settings),
            _ => await OllamaChatAsync(messages, settings, tools)
        };
    }

    private async Task<ProviderChatResponse> OllamaChatAsync(
        List<ProviderMessage> messages,
        AiSettings settings,
        IReadOnlyList<object> tools)
    {
        var payload = new Dictionary<string, object?>
        {
            ["model"] = settings.Model,
            ["messages"] = BuildOllamaMessages(messages),
            ["stream"] = false,
            ["options"] = new { temperature = 0.2 }
        };
        if (tools.Count > 0)
        {
            payload["tools"] = tools;
        }

        using var response = await _httpClient.PostAsJsonAsync($"{settings.BaseUrl.TrimEnd('/')}/api/chat", payload);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            ThrowProviderException("Ollama", response, body);
        }

        using var document = JsonDocument.Parse(body);
        var message = document.RootElement.GetProperty("message");
        var content = message.TryGetProperty("content", out var contentElement)
            ? contentElement.GetString()
            : "";
        var toolCalls = ParseToolCalls(message);
        if (string.IsNullOrWhiteSpace(content) && toolCalls.Count == 0)
        {
            throw new InvalidOperationException("Ollama returned an empty response.");
        }

        return new ProviderChatResponse(content ?? "", toolCalls);
    }

    private async Task<ProviderChatResponse> OpenAiCompatibleChatAsync(
        List<ProviderMessage> messages,
        AiSettings settings,
        IReadOnlyList<object> tools)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            throw new InvalidOperationException("API key is required for OpenAI-compatible providers.");
        }

        var payload = new Dictionary<string, object?>
        {
            ["model"] = settings.Model,
            ["messages"] = messages,
            ["temperature"] = 0.2
        };
        if (tools.Count > 0)
        {
            payload["tools"] = tools;
            payload["tool_choice"] = "auto";
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{settings.BaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);

        using var response = await _httpClient.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            ThrowProviderException("AI provider", response, body);
        }

        using var document = JsonDocument.Parse(body);
        var message = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message");
        var content = message.TryGetProperty("content", out var contentElement)
            ? contentElement.GetString()
            : "";
        var toolCalls = ParseToolCalls(message);

        if (string.IsNullOrWhiteSpace(content) && toolCalls.Count == 0)
        {
            throw new InvalidOperationException("AI provider returned an empty response.");
        }

        return new ProviderChatResponse(content ?? "", toolCalls);
    }

    private async Task<ProviderChatResponse> GeminiChatAsync(List<ProviderMessage> messages, AiSettings settings)
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
            ThrowProviderException("Gemini", response, body);
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

        return new ProviderChatResponse(content, new List<ProviderToolCall>());
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

    private void ThrowProviderException(string providerName, HttpResponseMessage response, string body)
    {
        var statusCode = (int)response.StatusCode;
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "";

        _logger.LogWarning(
            "{ProviderName} returned HTTP {StatusCode} ({ContentType}): {Body}",
            providerName,
            statusCode,
            contentType,
            TruncateForLog(body));

        var message = statusCode >= 500
            ? "The AI provider is temporarily unavailable. Please try again in a few minutes."
            : BuildProviderClientErrorMessage(providerName, statusCode, contentType, body);

        throw new AiProviderException(message, statusCode >= 500 ? 502 : 400);
    }

    private static string BuildProviderClientErrorMessage(string providerName, int statusCode, string contentType, string body)
    {
        if (contentType.Contains("json", StringComparison.OrdinalIgnoreCase))
        {
            var providerMessage = TryReadProviderErrorMessage(body);
            if (!string.IsNullOrWhiteSpace(providerMessage))
            {
                return $"{providerName} rejected the request: {providerMessage}";
            }
        }

        return $"{providerName} rejected the request with HTTP {statusCode}.";
    }

    private static string? TryReadProviderErrorMessage(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.TryGetProperty("error", out var error))
            {
                if (error.ValueKind == JsonValueKind.String)
                {
                    return error.GetString();
                }

                if (error.ValueKind == JsonValueKind.Object &&
                    error.TryGetProperty("message", out var errorMessage) &&
                    errorMessage.ValueKind == JsonValueKind.String)
                {
                    return errorMessage.GetString();
                }
            }

            if (root.TryGetProperty("message", out var message) &&
                message.ValueKind == JsonValueKind.String)
            {
                return message.GetString();
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static string TruncateForLog(string value, int maxLength = 1000)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength] + "...";
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
            "When the user asks you to create or configure tables, fields, pages, or page components, use the available tools. " +
            "Vietnamese requests like tao trang, them component, chen block, dung bang, su dung bang, cau hinh form, cap nhat page, or sua component are tool requests too. " +
            "Never print JSON function calls for the user to run, never explain that you will use a function, and never include comments inside function JSON; call the available tools directly. " +
            "Always use the exact English tool names and exact English argument names from the tool schema, even when the user writes in Vietnamese. " +
            "For page component requests, use the page name or slug provided by the user as pageName; do not ask for a page ID when a page name was given. " +
            "When the user asks to set a FormBlock or TableBlock to use a table by name, call configure_page_component with targetComponent and tableName. " +
            "Only call tools when the request is explicit enough to act. If a required ID or name is missing, ask a concise follow-up question. " +
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

    private static List<ProviderToolCall> ParseToolCalls(JsonElement message)
    {
        if (!message.TryGetProperty("tool_calls", out var toolCallsElement) ||
            toolCallsElement.ValueKind != JsonValueKind.Array)
        {
            return new List<ProviderToolCall>();
        }

        var calls = new List<ProviderToolCall>();
        var index = 0;
        foreach (var callElement in toolCallsElement.EnumerateArray())
        {
            if (!callElement.TryGetProperty("function", out var functionElement))
                continue;

            var id = callElement.TryGetProperty("id", out var idElement)
                ? idElement.GetString()
                : $"call_{index}";
            var name = functionElement.TryGetProperty("name", out var nameElement)
                ? nameElement.GetString()
                : null;
            if (string.IsNullOrWhiteSpace(name))
                continue;

            var arguments = "{}";
            if (functionElement.TryGetProperty("arguments", out var argumentsElement))
            {
                arguments = argumentsElement.ValueKind == JsonValueKind.String
                    ? argumentsElement.GetString() ?? "{}"
                    : argumentsElement.GetRawText();
            }

            calls.Add(new ProviderToolCall
            {
                Id = string.IsNullOrWhiteSpace(id) ? $"call_{index}" : id!,
                Type = "function",
                Function = new ProviderToolFunction
                {
                    Name = name,
                    Arguments = arguments
                }
            });
            index++;
        }

        return calls;
    }

    private static List<ProviderToolCall> ParseToolCallsFromText(string content)
    {
        var calls = new List<ProviderToolCall>();
        var index = 0;

        foreach (var json in ExtractJsonObjects(content))
        {
            try
            {
                using var document = JsonDocument.Parse(RemoveJsonComments(json));
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object ||
                    !root.TryGetProperty("name", out var nameElement))
                {
                    continue;
                }

                var name = nameElement.GetString();
                if (string.IsNullOrWhiteSpace(name) || !SupportedToolNames.Contains(name))
                {
                    continue;
                }

                var arguments = "{}";
                if (root.TryGetProperty("parameters", out var parametersElement) &&
                    parametersElement.ValueKind == JsonValueKind.Object)
                {
                    arguments = parametersElement.GetRawText();
                }
                else if (root.TryGetProperty("arguments", out var argumentsElement))
                {
                    arguments = argumentsElement.ValueKind == JsonValueKind.String
                        ? argumentsElement.GetString() ?? "{}"
                        : argumentsElement.GetRawText();
                }

                calls.Add(new ProviderToolCall
                {
                    Id = $"text_call_{index}",
                    Type = "function",
                    Function = new ProviderToolFunction
                    {
                        Name = name,
                        Arguments = arguments
                    }
                });
                index++;
            }
            catch (JsonException)
            {
                continue;
            }
        }

        return calls;
    }

    private static void TrackCreatedPage(AiToolExecution execution, IDictionary<string, int> createdPageIdsByName)
    {
        if (!execution.Success ||
            !execution.ToolName.Equals("create_page", StringComparison.OrdinalIgnoreCase) ||
            execution.Data == null)
        {
            return;
        }

        var dataJson = JsonSerializer.Serialize(execution.Data);
        using var document = JsonDocument.Parse(dataJson);
        var root = document.RootElement;
        if (!root.TryGetProperty("Name", out var nameElement) ||
            !root.TryGetProperty("Id", out var idElement))
        {
            return;
        }

        var name = nameElement.GetString();
        if (!string.IsNullOrWhiteSpace(name) && idElement.TryGetInt32(out var id))
        {
            createdPageIdsByName[name] = id;
        }
    }

    private static string ResolveNewPageReference(string arguments, IReadOnlyDictionary<string, int> createdPageIdsByName)
    {
        if (createdPageIdsByName.Count == 0 || string.IsNullOrWhiteSpace(arguments))
        {
            return arguments;
        }

        try
        {
            var args = JsonNode.Parse(arguments)?.AsObject();
            if (args == null || args["pageId"] != null)
            {
                return arguments;
            }

            var pageName = args["pageName"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(pageName) ||
                !createdPageIdsByName.TryGetValue(pageName, out var pageId))
            {
                return arguments;
            }

            args["pageId"] = pageId;
            return args.ToJsonString();
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            return arguments;
        }
    }

    private static List<string> ExtractJsonObjects(string content)
    {
        var objects = new List<string>();
        var depth = 0;
        var start = -1;
        var inString = false;
        var escaped = false;

        for (var index = 0; index < content.Length; index++)
        {
            var character = content[index];

            if (inString)
            {
                if (escaped)
                {
                    escaped = false;
                }
                else if (character == '\\')
                {
                    escaped = true;
                }
                else if (character == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (character == '"')
            {
                inString = true;
                continue;
            }

            if (character == '{')
            {
                if (depth == 0)
                {
                    start = index;
                }

                depth++;
                continue;
            }

            if (character != '}' || depth == 0)
            {
                continue;
            }

            depth--;
            if (depth == 0 && start >= 0)
            {
                objects.Add(content.Substring(start, index - start + 1));
                start = -1;
            }
        }

        return objects;
    }

    private static string RemoveJsonComments(string json)
    {
        var result = new System.Text.StringBuilder(json.Length);
        var inString = false;
        var escaped = false;

        for (var index = 0; index < json.Length; index++)
        {
            var character = json[index];

            if (inString)
            {
                result.Append(character);
                if (escaped)
                {
                    escaped = false;
                }
                else if (character == '\\')
                {
                    escaped = true;
                }
                else if (character == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (character == '"')
            {
                inString = true;
                result.Append(character);
                continue;
            }

            if (character == '/' && index + 1 < json.Length && json[index + 1] == '/')
            {
                while (index < json.Length && json[index] != '\n' && json[index] != '\r')
                {
                    index++;
                }

                if (index < json.Length)
                {
                    result.Append(json[index]);
                }

                continue;
            }

            result.Append(character);
        }

        return result.ToString();
    }

    private static IReadOnlyList<object> BuildOllamaMessages(IReadOnlyList<ProviderMessage> messages)
    {
        return messages.Select(message =>
        {
            var item = new Dictionary<string, object?>
            {
                ["role"] = message.Role,
                ["content"] = message.Content
            };

            if (!string.IsNullOrWhiteSpace(message.ToolCallId))
            {
                item["tool_call_id"] = message.ToolCallId;
            }

            if (message.ToolCalls?.Count > 0)
            {
                item["tool_calls"] = message.ToolCalls.Select(call => new
                {
                    id = call.Id,
                    type = call.Type,
                    function = new
                    {
                        name = call.Function.Name,
                        arguments = ParseArgumentsForOllama(call.Function.Arguments)
                    }
                }).ToList();
            }

            return item;
        }).ToList();
    }

    private static object ParseArgumentsForOllama(string arguments)
    {
        if (string.IsNullOrWhiteSpace(arguments))
            return new Dictionary<string, object?>();

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(arguments)
                ?? new Dictionary<string, object?>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?>
            {
                ["rawArguments"] = arguments
            };
        }
    }

    private static bool ShouldOfferTools(string question)
    {
        var normalized = RemoveDiacritics(question).ToLowerInvariant();
        string[] actionTerms =
        {
            "create", "add", "build", "make", "generate", "insert", "new", "update", "edit", "configure", "set", "use",
            "tao", "them", "chen", "moi", "cap nhat", "sua", "chinh sua", "cau hinh", "dat", "dung", "su dung", "gan"
        };
        string[] objectTerms =
        {
            "table", "field", "column", "page", "component", "form", "formblock", "block", "view",
            "bang", "truong", "cot", "trang", "thanh phan", "bieu mau", "form", "khoi", "giao dien"
        };

        return ContainsAnyTerm(normalized, actionTerms) && ContainsAnyTerm(normalized, objectTerms);
    }

    private static bool ContainsAnyTerm(string text, IEnumerable<string> terms)
    {
        return terms.Any(term => Regex.IsMatch(text, $@"(^|[^\p{{L}}\p{{N}}]){Regex.Escape(term)}($|[^\p{{L}}\p{{N}}])"));
    }

    private static string RemoveDiacritics(string text)
    {
        var normalized = text.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character);
            }
        }

        return builder.ToString().Normalize(NormalizationForm.FormC).Replace('đ', 'd').Replace('Đ', 'D');
    }

    private static string BuildFallbackToolAnswer(IReadOnlyList<AiToolExecution> toolExecutions)
    {
        if (toolExecutions.Count == 0)
            return "Done.";

        return string.Join("\n", toolExecutions.Select(result =>
            result.Success ? result.Message : $"Tool failed: {result.Message}"));
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
public record DocumentationChunk(string Source, string Heading, string Text);

public class ProviderMessage
{
    public ProviderMessage(string role, string content)
    {
        Role = role;
        Content = content;
    }

    [JsonPropertyName("role")]
    public string Role { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; }

    [JsonPropertyName("tool_calls")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ProviderToolCall>? ToolCalls { get; set; }

    [JsonPropertyName("tool_call_id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ToolCallId { get; set; }

    public static ProviderMessage ToolResult(string toolCallId, string content)
    {
        return new ProviderMessage("tool", content)
        {
            ToolCallId = toolCallId
        };
    }
}

public class ProviderChatResponse
{
    public ProviderChatResponse(string? content, List<ProviderToolCall> toolCalls)
    {
        Content = content;
        ToolCalls = toolCalls;
    }

    public string? Content { get; set; }
    public List<ProviderToolCall> ToolCalls { get; set; }
}

public class ProviderToolCall
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "function";

    [JsonPropertyName("function")]
    public ProviderToolFunction Function { get; set; } = new();
}

public class ProviderToolFunction
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("arguments")]
    public string Arguments { get; set; } = "{}";
}

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
    public List<AiToolExecution> Tools { get; set; } = new();
    public List<AiChatSource> Sources { get; set; } = new();
}

public class AiChatSource
{
    public string Source { get; set; } = "";
    public string Heading { get; set; } = "";
}

public class AiProviderException : Exception
{
    public AiProviderException(string message, int statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public int StatusCode { get; }
}
