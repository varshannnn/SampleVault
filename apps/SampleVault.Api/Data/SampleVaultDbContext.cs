using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Models;

namespace SampleVault.Api.Data;

public class SampleVaultDbContext : DbContext
{
    public SampleVaultDbContext(
        DbContextOptions<SampleVaultDbContext> options)
        : base(options)
    {
    }

    public DbSet<AudioSample> Samples => Set<AudioSample>();
}