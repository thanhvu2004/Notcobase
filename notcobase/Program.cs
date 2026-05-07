using Microsoft.AspNetCore.Authentication.JwtBearer;
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
// Routing
app.UseRouting();
// Authentication
app.UseAuthentication();
// Authorization
app.UseAuthorization();

// ENDPOINTS
app.MapControllers();
app.MapRazorPages();
app.Run();