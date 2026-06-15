using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Services.Seeding;

public class MetadataSeeder
{
    private readonly AppDbContext _context;

    public MetadataSeeder(AppDbContext context)
    {
        _context = context;
    }

    public async Task SeedAsync()
    {
        await SeedComponentDefinitionsAsync();
        await SeedBlockTemplatesAsync();
        await SeedLayoutTemplatesAsync();
    }

    private async Task SeedComponentDefinitionsAsync()
    {
        foreach (var seed in MetadataSeedData.ComponentDefinitions)
        {
            var exists = await _context.ComponentDefinitions
                .AnyAsync(c => c.ComponentName == seed.ComponentName);

            if (exists)
            {
                continue;
            }

            _context.ComponentDefinitions.Add(new ComponentDefinition
            {
                ComponentName = seed.ComponentName,
                Category = seed.Category,
                DefaultPropsJson = seed.DefaultPropsJson,
                DefaultSchemaJson = seed.DefaultSchemaJson,
                Icon = seed.Icon,
                CanHaveChildren = seed.CanHaveChildren,
            });
        }

        await _context.SaveChangesAsync();
    }

    private async Task SeedBlockTemplatesAsync()
    {
        await SeedTemplatesAsync(MetadataSeedData.BlockTemplates);
    }

    private async Task SeedLayoutTemplatesAsync()
    {
        await SeedTemplatesAsync(MetadataSeedData.LayoutTemplates);
    }

    private async Task SeedTemplatesAsync(IReadOnlyList<MetadataSeedData.BlockTemplateSeed> templates)
    {
        foreach (var seed in templates)
        {
            var exists = await _context.BlockTemplates
                .AnyAsync(t => t.Name == seed.Name && t.Type == seed.Type);

            if (exists)
            {
                continue;
            }

            _context.BlockTemplates.Add(new BlockTemplate
            {
                Name = seed.Name,
                Type = seed.Type,
                SchemaJson = seed.SchemaJson.Trim(),
            });
        }

        await _context.SaveChangesAsync();
    }
}
