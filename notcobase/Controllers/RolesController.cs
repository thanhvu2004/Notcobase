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
    public class RolesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public RolesController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        // [Permission("roles.view")]
        public async Task<IActionResult> GetRoles()
        {
            var roles = await _context.Roles
                .Include(r => r.RolePermissions)
                    .ThenInclude(rp => rp.Permission)
                .Select(r => new
                {
                    r.Id,
                    r.RoleName,

                    Permissions = r.RolePermissions
                        .Select(rp => rp.Permission!.PermissionName)
                        .ToList()
                })
                .ToListAsync();

            return Ok(roles);
        }

        [HttpGet("{id}")]
        // [Permission("roles.view")]
        public async Task<IActionResult> GetRole(int id)
        {
            var role = await _context.Roles
                .Include(r => r.RolePermissions)
                    .ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (role == null)
            {
                return NotFound();
            }

            return Ok(new
            {
                role.Id,
                role.RoleName,

                Permissions = role.RolePermissions
                    .Select(rp => rp.Permission!.PermissionName)
                    .ToList()
            });
        }

        [HttpPost]
        [Permission("roles.create")]
        public async Task<IActionResult> CreateRole(CreateRoleDto dto)
        {
            var existingRole = await _context.Roles
                .FirstOrDefaultAsync(r => r.RoleName == dto.Name);

            if (existingRole != null)
            {
                return BadRequest("Role already exists.");
            }

            var role = new Role
            {
                RoleName = dto.Name
            };

            _context.Roles.Add(role);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Role created successfully."
            });
        }

        [HttpPut("{id}")]
        [Permission("roles.edit")]
        public async Task<IActionResult> UpdateRole(
            int id,
            UpdateRoleDto dto)
        {
            var role = await _context.Roles.FindAsync(id);

            if (role == null)
            {
                return NotFound();
            }

            role.RoleName = dto.Name;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Role updated successfully."
            });
        }

        [HttpDelete("{id}")]
        [Permission("roles.delete")]
        public async Task<IActionResult> DeleteRole(int id)
        {
            var role = await _context.Roles.FindAsync(id);

            if (role == null)
            {
                return NotFound();
            }

            _context.Roles.Remove(role);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Role deleted successfully."
            });
        }

        [HttpPost("{id}/permissions")]
        [Permission("permissions.assign")]
        public async Task<IActionResult> AssignPermission(
            int id,
            AssignPermissionDto dto)
        {
            var role = await _context.Roles.FindAsync(id);

            if (role == null)
            {
                return NotFound("Role not found.");
            }

            var permission = await _context.Permissions
                .FindAsync(dto.PermissionId);

            if (permission == null)
            {
                return NotFound("Permission not found.");
            }

            var existingRolePermission =
                await _context.RolePermissions
                    .FirstOrDefaultAsync(rp =>
                        rp.RoleId == id &&
                        rp.PermissionId == dto.PermissionId);

            if (existingRolePermission != null)
            {
                return BadRequest(
                    "Role already has this permission.");
            }

            var rolePermission = new RolePermission
            {
                RoleId = id,
                PermissionId = dto.PermissionId
            };

            _context.RolePermissions.Add(rolePermission);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Permission assigned successfully."
            });
        }

        [HttpDelete("{id}/permissions/{permissionId}")]
        [Permission("permissions.remove")]
        public async Task<IActionResult> RemovePermission(
            int id,
            int permissionId)
        {
            var rolePermission =
                await _context.RolePermissions
                    .FirstOrDefaultAsync(rp =>
                        rp.RoleId == id &&
                        rp.PermissionId == permissionId);

            if (rolePermission == null)
            {
                return NotFound();
            }

            _context.RolePermissions.Remove(rolePermission);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Permission removed successfully."
            });
        }
    }

    public class CreateRoleDto
    {
        public string Name { get; set; } = "";
    }

    public class UpdateRoleDto
    {
        public string Name { get; set; } = "";
    }

    public class AssignPermissionDto
    {
        public int PermissionId { get; set; }
    }
}