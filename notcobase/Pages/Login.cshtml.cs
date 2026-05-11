using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace notcobase.Pages;

[IgnoreAntiforgeryToken]
public class LoginModel : PageModel
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public LoginModel(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    [BindProperty]
    [Required]
    public string Username { get; set; } = string.Empty;

    [BindProperty]
    [Required]
    public string Password { get; set; } = string.Empty;

    public string ErrorMessage { get; set; } = string.Empty;

    public async Task<IActionResult> OnPostAsync()
    {
        // Get values directly from form
        var username = Request.Form["Username"].ToString();
        var password = Request.Form["Password"].ToString();
        
        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
        {
            ErrorMessage = "Username and password are required.";
            return new JsonResult(new
            {
                success = false,
                message = "Username and password are required."
            });
        }

        try
        {
            var user = await _context.Users
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                        .ThenInclude(r => r.RolePermissions)
                            .ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(u => u.Username == username);

            if (user == null)
            {
                ErrorMessage = "Invalid username or password.";
                return new JsonResult(new
                {
                    success = false,
                    message = "Invalid username or password."
                });
            }

            bool validPassword = BCrypt.Net.BCrypt.Verify(password, user.PasswordHashed);

            if (!validPassword)
            {
                ErrorMessage = "Invalid username or password.";
                return new JsonResult(new
                {
                    success = false,
                    message = "Invalid username or password."
                });
            }

            var roles = user.UserRoles
                .Select(ur => ur.Role!.RoleName)
                .Distinct()
                .ToList();

            var permissions = user.UserRoles
                .SelectMany(ur => ur.Role!.RolePermissions)
                .Select(rp => rp.Permission!.PermissionName)
                .Distinct()
                .ToList();

            var token = GenerateJwtToken(user, roles, permissions);

            // Redirect to admin page or home
            return new JsonResult(new
            {
                success = true,
                token = token
            });
        }
        catch (Exception)
        {
            ErrorMessage = "An error occurred during login. Please try again.";
        }

        return new JsonResult(new
        {
            success = false,
            message = "An error occurred during login."
        });
    }

    public IActionResult OnGetLogout()
    {
        HttpContext.Session.Clear();
        return RedirectToPage("/Login");
    }

    private string GenerateJwtToken(User user, List<string> roles, List<string> permissions)
    {
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username)
        };

        // Add roles
        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        // Add permissions
        Console.WriteLine($"User {user.Username} has permissions: {string.Join(", ", permissions)}");
        foreach (var permission in permissions)
        {
            claims.Add(new Claim("permission", permission));
        }

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(
                _configuration["Jwt:Key"]!));

        var creds = new SigningCredentials(
            key,
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.Now.AddDays(7),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}