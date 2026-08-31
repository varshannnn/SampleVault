using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Data;
using SampleVault.Api.Models;
using SampleVault.Api.Services;

namespace SampleVault.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SamplesController : ControllerBase
{
    private readonly SampleScanner _scanner;
    private readonly SampleVaultDbContext _db;

    public SamplesController(
        SampleScanner scanner,
        SampleVaultDbContext db)
    {
        _scanner = scanner;
        _db = db;
    }

    [HttpPost("scan")]
    public async Task<IActionResult> ScanFolder(
        ScanFolderRequest request)
    {
        int addedCount =
            await _scanner.ScanFolderAsync(request.FolderPath);

        return Ok(new
        {
            added = addedCount
        });
    }

    [HttpGet]
    public async Task<IActionResult> GetSamples()
    {
        var samples = await _db.Samples
            .OrderBy(sample => sample.FileName)
            .ToListAsync();

        return Ok(samples);
    }

    [HttpGet("{id}/audio")]
public async Task<IActionResult> GetAudio(int id)
{
    var sample = await _db.Samples.FindAsync(id);

    if (sample == null)
    {
        return NotFound();
    }

    if (!System.IO.File.Exists(sample.FilePath))
    {
        return NotFound(new
        {
            message = "The audio file no longer exists on disk."
        });
    }

    return PhysicalFile(
        sample.FilePath,
        "audio/wav",
        enableRangeProcessing: true);
}
}