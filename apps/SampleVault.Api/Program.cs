using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Data;
using SampleVault.Api.Services;

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
