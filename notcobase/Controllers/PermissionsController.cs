using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using notcobase.Authorization;
using notcobase.Data;
using notcobase.Models;

namespace notcobase.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PermissionsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PermissionsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        // [Permission("permissions.view")]
        public async Task<IActionResult> GetPermissions()
        {
            var permissions = await _context.Permissions
                .Select(p => new
                {
                    p.Id,
                    p.PermissionName
                })
                .ToListAsync();

            return Ok(permissions);
        }

        [HttpGet("{id}")]
        // [Permission("permissions.view")]
        public async Task<IActionResult> GetPermission(int id)
        {
            var permission = await _context.Permissions
                .FirstOrDefaultAsync(p => p.Id == id);

            if (permission == null)
            {
                return NotFound();
            }

            return Ok(new
            {
                permission.Id,
                permission.PermissionName
            });
        }

        [HttpPost]
        [Permission("permissions.create")]
        public async Task<IActionResult> CreatePermission(
            CreatePermissionDto dto)
        {
            var existingPermission = await _context.Permissions
                .FirstOrDefaultAsync(p => p.PermissionName == dto.Name);

            if (existingPermission != null)
            {
                return BadRequest(
                    "Permission already exists.");
            }

            var permission = new Permission
            {
                PermissionName = dto.Name
            };

            _context.Permissions.Add(permission);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Permission created successfully."
            });
        }

        [HttpPut("{id}")]
        [Permission("permissions.edit")]
        public async Task<IActionResult> UpdatePermission(
            int id,
            UpdatePermissionDto dto)
        {
            var permission = await _context.Permissions
                .FindAsync(id);

            if (permission == null)
            {
                return NotFound();
            }

            permission.PermissionName = dto.Name;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Permission updated successfully."
            });
        }

        [HttpDelete("{id}")]
        [Permission("permissions.delete")]
        public async Task<IActionResult> DeletePermission(int id)
        {
            var permission = await _context.Permissions
                .FindAsync(id);

            if (permission == null)
            {
                return NotFound();
            }

            _context.Permissions.Remove(permission);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Permission deleted successfully."
            });
        }
    }

    public class CreatePermissionDto
    {
        public string Name { get; set; } = "";
    }

    public class UpdatePermissionDto
    {
        public string Name { get; set; } = "";
    }
}