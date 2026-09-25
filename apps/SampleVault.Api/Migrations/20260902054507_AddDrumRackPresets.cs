using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SampleVault.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDrumRackPresets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DrumRackPresets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DrumRackPresets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DrumRackPresetSlots",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    DrumRackPresetId = table.Column<int>(type: "INTEGER", nullable: false),
                    SlotIndex = table.Column<int>(type: "INTEGER", nullable: false),
                    SourceKind = table.Column<string>(type: "TEXT", nullable: false),
                    AudioSampleId = table.Column<int>(type: "INTEGER", nullable: true),
                    FileName = table.Column<string>(type: "TEXT", nullable: false),
                    FilePath = table.Column<string>(type: "TEXT", nullable: false),
                    DurationSeconds = table.Column<double>(type: "REAL", nullable: false),
                    TagsJson = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DrumRackPresetSlots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DrumRackPresetSlots_DrumRackPresets_DrumRackPresetId",
                        column: x => x.DrumRackPresetId,
                        principalTable: "DrumRackPresets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DrumRackPresetSlots_Samples_AudioSampleId",
                        column: x => x.AudioSampleId,
                        principalTable: "Samples",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_DrumRackPresetSlots_AudioSampleId",
                table: "DrumRackPresetSlots",
                column: "AudioSampleId");

            migrationBuilder.CreateIndex(
                name: "IX_DrumRackPresetSlots_DrumRackPresetId",
                table: "DrumRackPresetSlots",
                column: "DrumRackPresetId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DrumRackPresetSlots");

            migrationBuilder.DropTable(
                name: "DrumRackPresets");
        }
    }
}
