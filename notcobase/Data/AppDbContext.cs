using Microsoft.EntityFrameworkCore;
using notcobase.Models;

namespace notcobase.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Table> Tables { get; set; }
    public DbSet<Column> Columns { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<Role> Roles { get; set; }
    public DbSet<UserRole> UserRoles { get; set; }
    public DbSet<Permission> Permissions { get; set; }
    public DbSet<RolePermission> RolePermissions { get; set; }
    public DbSet<LowCodePage> LowCodePages { get; set; }
    public DbSet<ComponentDefinition> ComponentDefinitions { get; set; }
    public DbSet<BlockTemplate> BlockTemplates { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure Table entity
        modelBuilder.Entity<Table>()
            .HasOne(t => t.ParentTable)
            .WithMany(t => t.ChildTables)
            .HasForeignKey(t => t.ParentTableId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Table>()
            .HasMany(t => t.Columns)
            .WithOne(c => c.Table)
            .HasForeignKey(c => c.TableId)
            .OnDelete(DeleteBehavior.Cascade);

        // Set string lengths
        modelBuilder.Entity<Table>()
            .Property(t => t.Name)
            .HasMaxLength(255);

        modelBuilder.Entity<Column>()
            .Property(c => c.Name)
            .HasMaxLength(255);

        modelBuilder.Entity<Column>()
            .Property(c => c.FieldType)
            .HasMaxLength(50);

        modelBuilder.Entity<LowCodePage>()
            .Property(p => p.Name)
            .HasMaxLength(255);

        modelBuilder.Entity<LowCodePage>()
            .Property(p => p.Slug)
            .HasMaxLength(255);

        modelBuilder.Entity<LowCodePage>()
            .HasIndex(p => p.Slug)
            .IsUnique();

        // Role base access
        modelBuilder.Entity<UserRole>()
            .HasKey(ur => new { ur.UserId, ur.RoleId });

        modelBuilder.Entity<RolePermission>()
            .HasKey(rp => new { rp.RoleId, rp.PermissionId });

        modelBuilder.Entity<UserRole>()
            .HasOne(ur => ur.User)
            .WithMany(u => u.UserRoles)
            .HasForeignKey(ur => ur.UserId);

        modelBuilder.Entity<UserRole>()
            .HasOne(ur => ur.Role)
            .WithMany(r => r.UserRoles)
            .HasForeignKey(ur => ur.RoleId);

        modelBuilder.Entity<RolePermission>()
            .HasOne(rp => rp.Role)
            .WithMany(r => r.RolePermissions)
            .HasForeignKey(rp => rp.RoleId);

        modelBuilder.Entity<RolePermission>()
            .HasOne(rp => rp.Permission)
            .WithMany(r => r.RolePermissions)
            .HasForeignKey(rp => rp.PermissionId);

        modelBuilder.Entity<ComponentDefinition>()
            .Property(c => c.ComponentName)
            .HasMaxLength(128);

        modelBuilder.Entity<ComponentDefinition>()
            .Property(c => c.Category)
            .HasMaxLength(64);

        modelBuilder.Entity<ComponentDefinition>()
            .Property(c => c.Icon)
            .HasMaxLength(64);

        modelBuilder.Entity<ComponentDefinition>()
            .HasIndex(c => c.ComponentName)
            .IsUnique();

        modelBuilder.Entity<BlockTemplate>()
            .Property(t => t.Name)
            .HasMaxLength(255);

        modelBuilder.Entity<BlockTemplate>()
            .Property(t => t.Type)
            .HasMaxLength(64);

        modelBuilder.Entity<BlockTemplate>()
            .HasIndex(t => new { t.Name, t.Type })
            .IsUnique();
    }
}
