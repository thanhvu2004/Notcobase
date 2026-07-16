using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using notcobase.Authorization;
using notcobase.Models;
using notcobase.Services;

namespace notcobase.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AiController : ControllerBase
{
    private readonly AiChatService _aiChatService;

    public AiController(AiChatService aiChatService)
    {
        _aiChatService = aiChatService;
    }

    [HttpGet("settings")]
    [Permission("ai.configure")]
    public async Task<IActionResult> GetSettings()
    {
        var settings = await _aiChatService.GetOrCreateSettingsAsync();
        return Ok(ToDto(settings));
    }

    [HttpPut("settings")]
    [Permission("ai.configure")]
    public async Task<IActionResult> UpdateSettings(UpdateAiSettingsDto dto)
    {
        var settings = await _aiChatService.UpdateSettingsAsync(new AiSettingsUpdate(
            dto.Provider,
            dto.Model,
            dto.BaseUrl,
            dto.ApiKey));

        return Ok(ToDto(settings));
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat(AiChatRequest request)
    {
        try
        {
            return Ok(await _aiChatService.ChatAsync(request, User));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { error = ex.Message });
        }
    }

    private static object ToDto(AiSettings settings)
    {
        return new
        {
            settings.Provider,
            settings.Model,
            settings.BaseUrl,
            HasApiKey = !string.IsNullOrWhiteSpace(settings.ApiKey),
            settings.UpdatedAt
        };
    }
}

public class UpdateAiSettingsDto
{
    public string? Provider { get; set; }
    public string? Model { get; set; }
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
}
