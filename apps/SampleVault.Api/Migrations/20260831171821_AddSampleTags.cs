using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SampleVault.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSampleTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Tags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AudioSampleTag",
                columns: table => new
                {
                    SamplesId = table.Column<int>(type: "INTEGER", nullable: false),
                    TagsId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AudioSampleTag", x => new { x.SamplesId, x.TagsId });
                    table.ForeignKey(
                        name: "FK_AudioSampleTag_Samples_SamplesId",
                        column: x => x.SamplesId,
                        principalTable: "Samples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AudioSampleTag_Tags_TagsId",
                        column: x => x.TagsId,
                        principalTable: "Tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AudioSampleTag_TagsId",
                table: "AudioSampleTag",
                column: "TagsId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AudioSampleTag");

            migrationBuilder.DropTable(
                name: "Tags");
        }
    }
}
