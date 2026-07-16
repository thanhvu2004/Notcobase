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
        await EnsureCoreMetadataSchemaAsync();
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
            "records.delete",
            "ai.configure",
            "pages.view",
            "pages.editor",
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

    private async Task EnsureCoreMetadataSchemaAsync()
    {
        var connection = _context.Database.GetDbConnection();
        var shouldClose = connection.State != System.Data.ConnectionState.Open;

        if (shouldClose)
            await connection.OpenAsync();

        try
        {
            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS Permissions (
                    Id INTEGER NOT NULL CONSTRAINT PK_Permissions PRIMARY KEY AUTOINCREMENT,
                    PermissionName TEXT NOT NULL,
                    Description TEXT NULL
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS Roles (
                    Id INTEGER NOT NULL CONSTRAINT PK_Roles PRIMARY KEY AUTOINCREMENT,
                    RoleName TEXT NOT NULL
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS Users (
                    Id INTEGER NOT NULL CONSTRAINT PK_Users PRIMARY KEY AUTOINCREMENT,
                    Username TEXT NOT NULL,
                    PasswordHashed TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS Tables (
                    Id INTEGER NOT NULL CONSTRAINT PK_Tables PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Description TEXT NULL,
                    InheritProperties INTEGER NOT NULL,
                    ParentTableId INTEGER NULL,
                    PhysicalTableCreated INTEGER NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL,
                    CONSTRAINT FK_Tables_Tables_ParentTableId FOREIGN KEY (ParentTableId) REFERENCES Tables (Id) ON DELETE RESTRICT
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS ComponentDefinitions (
                    Id INTEGER NOT NULL CONSTRAINT PK_ComponentDefinitions PRIMARY KEY AUTOINCREMENT,
                    ComponentName TEXT NOT NULL,
                    Category TEXT NOT NULL,
                    DefaultPropsJson TEXT NOT NULL,
                    DefaultSchemaJson TEXT NOT NULL,
                    Icon TEXT NULL,
                    CanHaveChildren INTEGER NOT NULL,
                    CreatedAt TEXT NOT NULL
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS BlockTemplates (
                    Id INTEGER NOT NULL CONSTRAINT PK_BlockTemplates PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Type TEXT NOT NULL,
                    SchemaJson TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS AiSettings (
                    Id INTEGER NOT NULL CONSTRAINT PK_AiSettings PRIMARY KEY AUTOINCREMENT,
                    Provider TEXT NOT NULL,
                    Model TEXT NOT NULL,
                    BaseUrl TEXT NOT NULL,
                    ApiKey TEXT NULL,
                    UpdatedAt TEXT NOT NULL
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS LowCodePages (
                    Id INTEGER NOT NULL CONSTRAINT PK_LowCodePages PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Slug TEXT NULL,
                    SchemaJson TEXT NOT NULL,
                    IsPublished INTEGER NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL,
                    SectionName TEXT NULL,
                    RequiredPermission TEXT NULL,
                    ShowInNavbar INTEGER NOT NULL DEFAULT 1
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS Columns (
                    Id INTEGER NOT NULL CONSTRAINT PK_Columns PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    FieldType TEXT NOT NULL,
                    TableId INTEGER NOT NULL,
                    IsRequired INTEGER NOT NULL,
                    SortOrder INTEGER NOT NULL DEFAULT 0,
                    CreatedAt TEXT NOT NULL,
                    ComponentDefinitionId INTEGER NULL,
                    ComponentPropsJson TEXT NOT NULL DEFAULT '{}',
                    CONSTRAINT FK_Columns_Tables_TableId FOREIGN KEY (TableId) REFERENCES Tables (Id) ON DELETE CASCADE,
                    CONSTRAINT FK_Columns_ComponentDefinitions_ComponentDefinitionId FOREIGN KEY (ComponentDefinitionId) REFERENCES ComponentDefinitions (Id)
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS RolePermissions (
                    RoleId INTEGER NOT NULL,
                    PermissionId INTEGER NOT NULL,
                    CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionId),
                    CONSTRAINT FK_RolePermissions_Roles_RoleId FOREIGN KEY (RoleId) REFERENCES Roles (Id) ON DELETE CASCADE,
                    CONSTRAINT FK_RolePermissions_Permissions_PermissionId FOREIGN KEY (PermissionId) REFERENCES Permissions (Id) ON DELETE CASCADE
                );
                """);

            await ExecuteCommandAsync(connection, """
                CREATE TABLE IF NOT EXISTS UserRoles (
                    UserId INTEGER NOT NULL,
                    RoleId INTEGER NOT NULL,
                    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId),
                    CONSTRAINT FK_UserRoles_Users_UserId FOREIGN KEY (UserId) REFERENCES Users (Id) ON DELETE CASCADE,
                    CONSTRAINT FK_UserRoles_Roles_RoleId FOREIGN KEY (RoleId) REFERENCES Roles (Id) ON DELETE CASCADE
                );
                """);

            await ExecuteCommandAsync(connection, "CREATE UNIQUE INDEX IF NOT EXISTS IX_ComponentDefinitions_ComponentName ON ComponentDefinitions (ComponentName);");
            await ExecuteCommandAsync(connection, "CREATE UNIQUE INDEX IF NOT EXISTS IX_BlockTemplates_Name_Type ON BlockTemplates (Name, Type);");
            await ExecuteCommandAsync(connection, "CREATE UNIQUE INDEX IF NOT EXISTS IX_LowCodePages_Slug ON LowCodePages (Slug);");
            await ExecuteCommandAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Tables_ParentTableId ON Tables (ParentTableId);");
            await ExecuteCommandAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Columns_TableId ON Columns (TableId);");
            await ExecuteCommandAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Columns_ComponentDefinitionId ON Columns (ComponentDefinitionId);");
            await ExecuteCommandAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Columns_TableId_SortOrder ON Columns (TableId, SortOrder);");
            await ExecuteCommandAsync(connection, "CREATE INDEX IF NOT EXISTS IX_RolePermissions_PermissionId ON RolePermissions (PermissionId);");
            await ExecuteCommandAsync(connection, "CREATE INDEX IF NOT EXISTS IX_UserRoles_RoleId ON UserRoles (RoleId);");
        }
        finally
        {
            if (shouldClose)
                await connection.CloseAsync();
        }
    }

    private async Task EnsureColumnSortOrderSchemaAsync()
    {
        var connection = _context.Database.GetDbConnection();
        var shouldClose = connection.State != System.Data.ConnectionState.Open;

        if (shouldClose)
            await connection.OpenAsync();

        try
        {
            await using var tableCommand = connection.CreateCommand();
            tableCommand.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Columns'";
            var hasColumnsTable = Convert.ToInt32(await tableCommand.ExecuteScalarAsync()) > 0;

            if (!hasColumnsTable)
            {
                await _context.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE IF NOT EXISTS Columns (
                        Id INTEGER NOT NULL CONSTRAINT PK_Columns PRIMARY KEY AUTOINCREMENT,
                        Name TEXT NOT NULL,
                        FieldType TEXT NOT NULL,
                        TableId INTEGER NOT NULL,
                        IsRequired INTEGER NOT NULL,
                        SortOrder INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        ComponentDefinitionId INTEGER NULL,
                        ComponentPropsJson TEXT NOT NULL DEFAULT '{{}}',
                        CONSTRAINT FK_Columns_Tables_TableId FOREIGN KEY (TableId) REFERENCES Tables (Id) ON DELETE CASCADE,
                        CONSTRAINT FK_Columns_ComponentDefinitions_ComponentDefinitionId FOREIGN KEY (ComponentDefinitionId) REFERENCES ComponentDefinitions (Id)
                    );
                    """);
                await _context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Columns_TableId ON Columns (TableId)");
                await _context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Columns_ComponentDefinitionId ON Columns (ComponentDefinitionId)");
                await _context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Columns_TableId_SortOrder ON Columns (TableId, SortOrder)");
                return;
            }

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

    private static async Task ExecuteCommandAsync(System.Data.Common.DbConnection connection, string commandText)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = commandText;
        await command.ExecuteNonQueryAsync();
    }
}
