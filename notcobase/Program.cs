using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authorization;
using notcobase.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using notcobase.Data;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// SERVICES
// Controllers
builder.Services.AddControllers();

// HttpClient
builder.Services.AddHttpClient();

// Database Seeder
builder.Services.AddScoped<notcobase.Services.Seeding.MetadataSeeder>();
builder.Services.AddScoped<notcobase.Services.DatabaseSeeder>();

// Dynamic Table Service
builder.Services.AddScoped<notcobase.Services.DynamicTableService>();
builder.Services.AddScoped<notcobase.Services.SchemaMetadataSyncService>();

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

// DATABASE
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=app.db"));

JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();

// JWT AUTHENTICATION
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,

            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(
                    builder.Configuration["Jwt:Key"]!))
        };
    });

// AUTHORIZATION
builder.Services.AddAuthorization();

builder.Services.AddSingleton<
    IAuthorizationHandler,
    PermissionHandler>();

builder.Services.AddSingleton<
    IAuthorizationPolicyProvider,
    PermissionPolicyProvider>();

var app = builder.Build();

// MIDDLEWARE
// CORS
app.UseCors("AllowAll");

// Development
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/api/error");
    app.UseHsts();
}

// HTTPS
app.UseHttpsRedirection();
// Routing
app.UseRouting();
// Authentication
app.UseAuthentication();
// Authorization
app.UseAuthorization();

// ENDPOINTS
app.MapControllers();
app.Map("/api/error", () => Results.Problem());

// Seed database
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await EnsurePageNavigationColumnsAsync(context);

    var seeder = scope.ServiceProvider.GetRequiredService<notcobase.Services.DatabaseSeeder>();
    await seeder.SeedAsync();
}

app.Run();

static async Task EnsurePageNavigationColumnsAsync(AppDbContext context)
{
    var connection = context.Database.GetDbConnection();
    await connection.OpenAsync();
    try
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info('LowCodePages');";
        var hasSectionName = false;
        var hasRequiredPermission = false;
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                if (string.Equals(reader.GetString(1), "SectionName", StringComparison.OrdinalIgnoreCase))
                {
                    hasSectionName = true;
                }

                if (string.Equals(reader.GetString(1), "RequiredPermission", StringComparison.OrdinalIgnoreCase))
                {
                    hasRequiredPermission = true;
                }
            }
        }

        if (!hasSectionName)
        {
            await context.Database.ExecuteSqlRawAsync("ALTER TABLE LowCodePages ADD COLUMN SectionName TEXT NULL;");
        }

        if (!hasRequiredPermission)
        {
            await context.Database.ExecuteSqlRawAsync("ALTER TABLE LowCodePages ADD COLUMN RequiredPermission TEXT NULL;");
        }
    }
    finally
    {
        await connection.CloseAsync();
    }
}
