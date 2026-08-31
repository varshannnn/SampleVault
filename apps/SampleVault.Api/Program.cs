using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Data;
using SampleVault.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

builder.Services.AddDbContext<SampleVaultDbContext>(options =>
    options.UseSqlite("Data Source=samplevault.db"));

builder.Services.AddScoped<SampleScanner>();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
