using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Data;
using SampleVault.Api.Services;
using SampleVault.Api.Infrastructure;
using SampleVault.Api.Presets;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Add services to the container.

builder.Services.AddControllers();

builder.Services.AddDbContext<SampleVaultDbContext>(options =>
    options.UseSqlite("Data Source=samplevault.db"));

builder.Services.AddScoped<SampleScanner>();

builder.Services.AddSingleton<AutoTagger>();

builder.Services.AddSingleton<WaveformService>();

builder.Services.AddSingleton<AudioRenderService>();

builder.Services.AddSingleton<SampleVaultStoragePaths>();
builder.Services.AddSingleton<PresetFileStore>();
builder.Services.AddSingleton<DrumRackPresetExporter>();
builder.Services.AddSingleton<ManagedAudioAssetStore>();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseCors("Frontend");

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
