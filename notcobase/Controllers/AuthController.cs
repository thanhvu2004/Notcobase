using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using notcobase.Data;
using notcobase.Models;
using System.Text;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace notcobase.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
	private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

	public AuthController(AppDbContext context, IConfiguration configuration)
	{
		_context = context;
        _configuration = configuration;
	}

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto dto)
    {
        var existingUser = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == dto.Username);

        if (existingUser != null)
        {
            return BadRequest("Username already exists.");
        }

        var hashedPassword = BCrypt.Net.BCrypt.HashPassword(dto.Password);

        var user = new User
        {
            Username = dto.Username,
            PasswordHashed = hashedPassword
        };

        _context.Users.Add(user);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "User registered successfully."
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var user = await _context.Users
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                    .ThenInclude(r =>   r.RolePermissions)
                        .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(u => u.Username == dto.Username);

        if (user == null)
        {
            return Unauthorized("Invalid username or password.");
        }

        bool validPassword = BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHashed);

        if (!validPassword)
        {
            return Unauthorized("Invalid username or password.");
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

        return Ok(new
        {
            token,
            user = new
            {
                user.Id,
                user.Username,
                roles,
                permissions
            }
        });
    }

    private string GenerateJwtToken( User user, List<string> roles, List<string> permissions)
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

    public class RegisterDto
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public class LoginDto
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
    }
}
