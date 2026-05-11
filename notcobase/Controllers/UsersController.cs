using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;
using notcobase.Authorization;

namespace notcobase.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        // [Permission("users.view")]
        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _context.Users
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .Select(u => new
                {
                    u.Id,
                    u.Username,

                    Roles = u.UserRoles
                        .Select(ur => ur.Role!.RoleName)
                        .ToList()
                })
                .ToListAsync();

            return Ok(users);
        }

        // [Permission("users.view")]
        [HttpGet("{id}")]
        public async Task<IActionResult> GetUser(int id)
        {
            var user = await _context.Users
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.Id == id);

            if (user == null)
            {
                return NotFound();
            }

            return Ok(new
            {
                user.Id,
                user.Username,

                Roles = user.UserRoles
                    .Select(ur => ur.Role!.RoleName)
                    .ToList()
            });
        }

        [Permission("users.create")]
        [HttpPost]
        public async Task<IActionResult> CreateUser(CreateUserDto dto)
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
                message = "User created successfully."
            });
        }

        [Permission("users.edit")]
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUser(int id, UpdateUserDto dto)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound();
            }

            user.Username = dto.Username;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "User updated successfully."
            });
        }

        [Permission("users.delete")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound();
            }

            _context.Users.Remove(user);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "User deleted successfully."
            });
        }

        [Permission("roles.assign")]
        [HttpPost("{id}/roles")]
        public async Task<IActionResult> AssignRole(
            int id,
            AssignRoleDto dto)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound("User not found.");
            }

            var role = await _context.Roles.FindAsync(dto.RoleId);

            if (role == null)
            {
                return NotFound("Role not found.");
            }

            var existingUserRole = await _context.UserRoles
                .FirstOrDefaultAsync(ur =>
                    ur.UserId == id &&
                    ur.RoleId == dto.RoleId);

            if (existingUserRole != null)
            {
                return BadRequest("User already has this role.");
            }

            var userRole = new UserRole
            {
                UserId = id,
                RoleId = dto.RoleId
            };

            _context.UserRoles.Add(userRole);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Role assigned successfully."
            });
        }

        [Permission("roles.remove")]
        [HttpDelete("{id}/roles/{roleId}")]
        public async Task<IActionResult> RemoveRole(
            int id,
            int roleId)
        {
            var userRole = await _context.UserRoles
                .FirstOrDefaultAsync(ur =>
                    ur.UserId == id &&
                    ur.RoleId == roleId);

            if (userRole == null)
            {
                return NotFound();
            }

            _context.UserRoles.Remove(userRole);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Role removed successfully."
            });
        }
    }

    public class CreateUserDto
    {
        public string Username { get; set; } = "";

        public string Password { get; set; } = "";
    }

    public class UpdateUserDto
    {
        public string Username { get; set; } = "";
    }

    public class AssignRoleDto
    {
        public int RoleId { get; set; }
    }
}