using Microsoft.EntityFrameworkCore;
using notcobase.Data;
using notcobase.Models;
using notcobase.Services.Seeding;

namespace notcobase.Services;

public class DatabaseSeeder
{
    private readonly AppDbContext _context;
    private readonly MetadataSeeder _metadataSeeder;

    public DatabaseSeeder(AppDbContext context, MetadataSeeder metadataSeeder)
    {
        _context = context;
        _metadataSeeder = metadataSeeder;
    }

    public async Task SeedAsync()
    {
        await _context.Database.MigrateAsync();
        await EnsureColumnSortOrderSchemaAsync();
        // Create permissions if they don't exist
        var permissions = new[]
        {
            "users.view",
            "users.create",
            "users.edit",
            "users.delete",
            "roles.view",
            "roles.create",
            "roles.edit",
            "roles.delete",
            "roles.assign",
            "roles.remove",
            "permissions.view",
            "permissions.create",
            "permissions.edit",
            "permissions.delete",
            "permissions.assign",
            "permissions.remove",
            "pages.view",
            "pages.editor",
            "tables.view",
            "tables.create",
            "tables.edit",
            "tables.delete",
            "columns.view",
            "columns.create",
            "columns.edit",
            "columns.delete",
            "records.view",
            "records.create",
            "records.edit",
            "records.delete"
        };

        foreach (var permissionName in permissions)
        {
            var permission = await _context.Permissions
                .FirstOrDefaultAsync(p => p.PermissionName == permissionName);

            if (permission == null)
            {
                _context.Permissions.Add(new Permission { PermissionName = permissionName });
            }
        }

        await _context.SaveChangesAsync();

        // Create admin role if it doesn't exist
        var adminRole = await _context.Roles
            .FirstOrDefaultAsync(r => r.RoleName == "Administrator");

        if (adminRole == null)
        {
            adminRole = new Role { RoleName = "Administrator" };
            _context.Roles.Add(adminRole);
            await _context.SaveChangesAsync();
        }

        // Assign all permissions to admin role
        var allPermissions = await _context.Permissions.ToListAsync();
        foreach (var permission in allPermissions)
        {
            var rolePermission = await _context.RolePermissions
                .FirstOrDefaultAsync(rp => rp.RoleId == adminRole.Id && rp.PermissionId == permission.Id);

            if (rolePermission == null)
            {
                _context.RolePermissions.Add(new RolePermission
                {
                    RoleId = adminRole.Id,
                    PermissionId = permission.Id
                });
            }
        }

        await _context.SaveChangesAsync();

        // Create admin user if it doesn't exist
        var adminUser = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == "admin");

        if (adminUser == null)
        {
            adminUser = new User
            {
                Username = "admin",
                PasswordHashed = BCrypt.Net.BCrypt.HashPassword("admin123")
            };
            _context.Users.Add(adminUser);
            await _context.SaveChangesAsync();

            // Assign admin role to admin user
            var userRole = new UserRole
            {
                UserId = adminUser.Id,
                RoleId = adminRole.Id
            };
            _context.UserRoles.Add(userRole);
            await _context.SaveChangesAsync();
        }

        await _metadataSeeder.SeedAsync();
    }

    private async Task EnsureColumnSortOrderSchemaAsync()
    {
        var connection = _context.Database.GetDbConnection();
        var shouldClose = connection.State != System.Data.ConnectionState.Open;

        if (shouldClose)
            await connection.OpenAsync();

        try
        {
            await using var checkCommand = connection.CreateCommand();
            checkCommand.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Columns') WHERE name = 'SortOrder'";
            var hasSortOrder = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;

            if (hasSortOrder)
                return;

            await _context.Database.ExecuteSqlRawAsync("ALTER TABLE Columns ADD COLUMN SortOrder INTEGER NOT NULL DEFAULT 0");
            await _context.Database.ExecuteSqlRawAsync("UPDATE Columns SET SortOrder = Id WHERE SortOrder = 0");
            await _context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Columns_TableId_SortOrder ON Columns (TableId, SortOrder)");
        }
        finally
        {
            if (shouldClose)
                await connection.CloseAsync();
        }
    }
}
