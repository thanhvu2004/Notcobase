using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace notcobase.Controllers;

[ApiController]
[Route("api/lowcode-pages")]
[Authorize]
public class LowCodePagesController : ControllerBase
{
    private readonly AppDbContext _context;

    public LowCodePagesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<LowCodePageDto>>> GetPages()
    {
        var pages = await _context.LowCodePages
            .AsNoTracking()
            .OrderBy(p => p.Name)
            .Select(p => new LowCodePageDto
            {
                Id = p.Id,
                Name = p.Name,
                Slug = p.Slug,
                SchemaJson = p.SchemaJson,
                IsPublished = p.IsPublished,
                CreatedAt = p.CreatedAt,
                UpdatedAt = p.UpdatedAt,
            })
            .ToListAsync();

        return Ok(pages);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<LowCodePageDto>> GetPage(int id)
    {
        var page = await _context.LowCodePages
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id);

        if (page == null)
        {
            return NotFound();
        }

        return Ok(ToDto(page));
    }

    [HttpPost]
    public async Task<ActionResult<LowCodePageDto>> CreatePage(LowCodePageRequest request)
    {
        var validation = ValidateRequest(request);
        if (validation != null)
        {
            return BadRequest(validation);
        }

        var page = new LowCodePage
        {
            Name = request.Name.Trim(),
            Slug = await BuildUniqueSlug(request.Name),
            SchemaJson = request.SchemaJson,
            IsPublished = request.IsPublished,
        };

        _context.LowCodePages.Add(page);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetPage), new { id = page.Id }, ToDto(page));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<LowCodePageDto>> UpdatePage(int id, LowCodePageRequest request)
    {
        var validation = ValidateRequest(request);
        if (validation != null)
        {
            return BadRequest(validation);
        }

        var page = await _context.LowCodePages.FirstOrDefaultAsync(p => p.Id == id);
        if (page == null)
        {
            return NotFound();
        }

        page.Name = request.Name.Trim();
        page.SchemaJson = request.SchemaJson;
        page.IsPublished = request.IsPublished;
        page.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(ToDto(page));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeletePage(int id)
    {
        var page = await _context.LowCodePages.FirstOrDefaultAsync(p => p.Id == id);
        if (page == null)        {
            return NotFound();
        }

        _context.LowCodePages.Remove(page);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static string? ValidateRequest(LowCodePageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return "Page name is required.";
        }

        if (string.IsNullOrWhiteSpace(request.SchemaJson))
        {
            return "Schema JSON is required.";
        }

        try
        {
            JsonDocument.Parse(request.SchemaJson);
        }
        catch (JsonException)
        {
            return "Schema JSON is invalid.";
        }

        return null;
    }

    private async Task<string> BuildUniqueSlug(string name)
    {
        var baseSlug = Regex.Replace(name.Trim().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrWhiteSpace(baseSlug))
        {
            baseSlug = "page";
        }

        var slug = baseSlug;
        var suffix = 1;

        while (await _context.LowCodePages.AnyAsync(p => p.Slug == slug))
        {
            suffix++;
            slug = $"{baseSlug}-{suffix}";
        }

        return slug;
    }

    private static LowCodePageDto ToDto(LowCodePage page)
    {
        return new LowCodePageDto
        {
            Id = page.Id,
            Name = page.Name,
            Slug = page.Slug,
            SchemaJson = page.SchemaJson,
            IsPublished = page.IsPublished,
            CreatedAt = page.CreatedAt,
            UpdatedAt = page.UpdatedAt,
        };
    }
}

public class LowCodePageRequest
{
    public required string Name { get; set; }
    public required string SchemaJson { get; set; }
    public bool IsPublished { get; set; }
}

public class LowCodePageDto
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Slug { get; set; }
    public required string SchemaJson { get; set; }
    public bool IsPublished { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
