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

// Razor Pages
builder.Services.AddRazorPages();

// Session
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});

// HttpClient
builder.Services.AddHttpClient();

// Database Seeder
builder.Services.AddScoped<notcobase.Services.DatabaseSeeder>();

// Dynamic Table Service
builder.Services.AddScoped<notcobase.Services.DynamicTableService>();

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
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

// HTTPS
app.UseHttpsRedirection();
// Static Files
app.UseStaticFiles();
// Session
app.UseSession();
// Routing
app.UseRouting();
// Authentication
app.UseAuthentication();
// Authorization
app.UseAuthorization();

// ENDPOINTS
app.MapControllers();
app.MapRazorPages();

// Seed database
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<notcobase.Services.DatabaseSeeder>();
    await seeder.SeedAsync();
}

app.Run();