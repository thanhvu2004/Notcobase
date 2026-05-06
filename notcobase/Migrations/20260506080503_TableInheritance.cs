using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace notcobase.Migrations
{
    /// <inheritdoc />
    public partial class TableInheritance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "InheritProperties",
                table: "Tables",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ParentTableId",
                table: "Tables",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tables_ParentTableId",
                table: "Tables",
                column: "ParentTableId");

            migrationBuilder.AddForeignKey(
                name: "FK_Tables_Tables_ParentTableId",
                table: "Tables",
                column: "ParentTableId",
                principalTable: "Tables",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tables_Tables_ParentTableId",
                table: "Tables");

            migrationBuilder.DropIndex(
                name: "IX_Tables_ParentTableId",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "InheritProperties",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "ParentTableId",
                table: "Tables");
        }
    }
}
