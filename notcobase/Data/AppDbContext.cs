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
    public DbSet<Record> Records { get; set; }

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
            .HasMany(t => t.Records)
            .WithOne(r => r.Table)
            .HasForeignKey(r => r.TableId)
            .OnDelete(DeleteBehavior.Cascade);

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
    }
}
