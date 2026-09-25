using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NAudio.Wave;
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
    private readonly WaveformService _waveformService;
    private readonly AudioRenderService _audioRenderService;

    public SamplesController(
        SampleScanner scanner,
        SampleVaultDbContext db,
        WaveformService waveformService,
        AudioRenderService audioRenderService)
    {
        _scanner = scanner;
        _db = db;
        _waveformService = waveformService;
        _audioRenderService = audioRenderService;
    }

    [HttpPost("scan")]
    public async Task<IActionResult> ScanFolder(
        [FromBody] ScanFolderRequest request)
    {
        if (string.IsNullOrWhiteSpace(
            request.FolderPath))
        {
            return BadRequest(
                "Folder path is required.");
        }

        try
        {
            ScanResult result =
                await _scanner.ScanFolderAsync(
                    request.FolderPath);

            return Ok(result);
        }
        catch (DirectoryNotFoundException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet]
public async Task<IActionResult> GetSamples()
{
    var samples = await _db.Samples
        .OrderBy(sample => sample.FileName)
        .Select(sample => new
        {
            sample.Id,
            sample.FileName,
            sample.FilePath,
            sample.RelativePath,
            sample.Extension,
            sample.DurationSeconds,
            sample.SampleRate,
            sample.Channels,
            sample.IsFavorite,
            sample.IndexedAt,

            Tags = sample.Tags
                .Select(tag => tag.Name)
                .OrderBy(tag => tag)
                .ToList()
        })
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
[HttpPost("{id:int}/tags")]
public async Task<IActionResult> AddTag(
    int id,
    [FromBody] TagRequest request)
{
    string tagName = request.Name.Trim();

    if (string.IsNullOrWhiteSpace(tagName))
    {
        return BadRequest("Tag name cannot be empty.");
    }

    var sample = await _db.Samples
        .Include(sample => sample.Tags)
        .FirstOrDefaultAsync(sample => sample.Id == id);

    if (sample is null)
    {
        return NotFound();
    }

    Tag? tag = await _db.Tags
        .FirstOrDefaultAsync(tag =>
            tag.Name.ToLower() == tagName.ToLower());

    if (tag is null)
    {
        tag = new Tag
        {
            Name = tagName
        };

        _db.Tags.Add(tag);
    }

    bool alreadyHasTag = sample.Tags.Any(
        existingTag =>
            existingTag.Name.Equals(
                tag.Name,
                StringComparison.OrdinalIgnoreCase));

    if (!alreadyHasTag)
    {
        sample.Tags.Add(tag);
    }

    if (!tagName.Equals(
            "Other",
            StringComparison.OrdinalIgnoreCase))
    {
        Tag? otherTag = sample.Tags.FirstOrDefault(
            existingTag =>
                existingTag.Name.Equals(
                    "Other",
                    StringComparison.OrdinalIgnoreCase));

        if (otherTag is not null)
        {
            sample.Tags.Remove(otherTag);
        }
    }

    await _db.SaveChangesAsync();

    return Ok(new
    {
        sample.Id,
        Tags = sample.Tags
            .Select(tag => tag.Name)
            .OrderBy(name => name)
            .ToList()
    });
}
[HttpDelete("{id:int}/tags/{tagName}")]
public async Task<IActionResult> RemoveTag(
    int id,
    string tagName)
{
    var sample = await _db.Samples
        .Include(sample => sample.Tags)
        .FirstOrDefaultAsync(sample => sample.Id == id);

    if (sample is null)
    {
        return NotFound();
    }

    Tag? tag = sample.Tags.FirstOrDefault(
        existingTag =>
            existingTag.Name.Equals(
                tagName,
                StringComparison.OrdinalIgnoreCase));

    if (tag is null)
    {
        return NotFound("Sample does not have that tag.");
    }

    sample.Tags.Remove(tag);

    if (sample.Tags.Count == 0)
    {
        Tag? otherTag = await _db.Tags
            .FirstOrDefaultAsync(tag =>
                tag.Name.ToLower() == "other");

        if (otherTag is null)
        {
            otherTag = new Tag
            {
                Name = "Other"
            };

            _db.Tags.Add(otherTag);
        }

        sample.Tags.Add(otherTag);
    }

    await _db.SaveChangesAsync();

    return Ok(new
    {
        sample.Id,
        Tags = sample.Tags
            .Select(tag => tag.Name)
            .OrderBy(name => name)
            .ToList()
    });
}

[HttpPatch("{id:int}/favorite")]
public async Task<IActionResult> ToggleFavorite(int id)
{
    AudioSample? sample =
        await _db.Samples.FindAsync(id);

    if (sample is null)
    {
        return NotFound();
    }

    sample.IsFavorite = !sample.IsFavorite;

    await _db.SaveChangesAsync();

    return Ok(new
    {
        sample.Id,
        sample.IsFavorite
    });
}

[HttpGet("{id:int}/waveform")]
public async Task<IActionResult> GetWaveform(
    int id,
    [FromQuery] int points = 300)
{
    AudioSample? sample =
        await _db.Samples.FindAsync(id);

    if (sample is null)
    {
        return NotFound();
    }

    if (!System.IO.File.Exists(
        sample.FilePath))
    {
        return NotFound(
            "Audio file no longer exists.");
    }

    points = Math.Clamp(
        points,
        50,
        1000);

    try
    {
        float[] peaks =
            _waveformService.GeneratePeaks(
                sample.FilePath,
                points);

        return Ok(new
        {
            sample.Id,
            sample.DurationSeconds,
            Peaks = peaks
        });
    }
    catch (Exception ex)
    {
        return Problem(
            $"Could not generate waveform: {ex.Message}");
    }
}

[HttpPost("{id:int}/render")]
public async Task<IActionResult> RenderSample(
    int id,
    [FromBody] RenderSampleRequest request)
{
    AudioSample? sourceSample =
        await _db.Samples
            .Include(sample => sample.Tags)
            .FirstOrDefaultAsync(
                sample => sample.Id == id);

    if (sourceSample is null)
    {
        return NotFound();
    }

    try
    {
        /*
            1. Render the edited WAV to disk.
        */
        string outputPath =
            _audioRenderService
                .RenderSample(
                    sourceSample.FilePath,
                    request.StartTime,
                    request.EndTime,
                    request.Reverse);
        /*
            2. Read the new file so we can store
            its actual audio metadata.
        */
        using var reader =
            new AudioFileReader(outputPath);

        string fileName =
            Path.GetFileName(outputPath);

        /*
            3. Create a NEW database sample.

            Notice that we reuse the original
            Tag objects. We are NOT creating
            duplicate tags in the Tags table.
        */
        var renderedSample =
            new AudioSample
            {
                FileName = fileName,

                FilePath = outputPath,

                RelativePath =
                    Path.Combine(
                        "renders",
                        fileName),

                Category = "Renders",

                Extension =
                    Path.GetExtension(
                        outputPath),

                DurationSeconds =
                    reader.TotalTime.TotalSeconds,

                SampleRate =
                    reader.WaveFormat.SampleRate,

                Channels =
                    reader.WaveFormat.Channels,

                IsFavorite = false,

                Tags =
                    sourceSample.Tags.ToList()
            };

        _db.Samples.Add(
            renderedSample);

        await _db.SaveChangesAsync();

        /*
            4. Return the new SampleVault sample
            to the frontend.
        */
        return Ok(new
        {
            OutputPath = outputPath,

            Sample = new
            {
                renderedSample.Id,
                renderedSample.FileName,
                renderedSample.FilePath,
                renderedSample.RelativePath,
                renderedSample.Extension,
                renderedSample.DurationSeconds,
                renderedSample.SampleRate,
                renderedSample.Channels,
                renderedSample.IsFavorite,
                renderedSample.IndexedAt,

                Tags =
                    renderedSample.Tags
                        .Select(tag => tag.Name)
                        .OrderBy(tag => tag)
                        .ToList()
            }
        });
    }
    catch (ArgumentException ex)
    {
        return BadRequest(ex.Message);
    }
    catch (FileNotFoundException ex)
    {
        return NotFound(ex.Message);
    }
}

[HttpPost("{id:int}/render-temp")]
public async Task<IActionResult> RenderTemporarySample(
    int id,
    [FromBody] RenderSampleRequest request)
{
    AudioSample? sourceSample =
        await _db.Samples
            .Include(sample => sample.Tags)
            .FirstOrDefaultAsync(
                sample => sample.Id == id);

    if (sourceSample is null)
    {
        return NotFound();
    }

    try
    {
        var temporary =
            _audioRenderService
                .RenderTemporarySample(
                    sourceSample.FilePath,
                    request.StartTime,
                    request.EndTime,
                    request.Reverse);

        using var reader =
            new AudioFileReader(
                temporary.OutputPath);

        string displayName =
            $"{Path.GetFileNameWithoutExtension(sourceSample.FileName)}-lab-edit.wav";

        return Ok(new
        {
            tempId =
                temporary.TempId,

            fileName =
                displayName,

            durationSeconds =
                reader.TotalTime
                    .TotalSeconds,

            tags =
                sourceSample.Tags
                    .Select(
                        tag => tag.Name)
                    .OrderBy(
                        tag => tag)
                    .ToList(),

            audioUrl =
                $"http://localhost:5085/api/samples/temp/{temporary.TempId}/audio"
        });
    }
    catch (ArgumentException ex)
    {
        return BadRequest(
            ex.Message);
    }
    catch (FileNotFoundException ex)
    {
        return NotFound(
            ex.Message);
    }
}


[HttpGet("temp/{tempId}/audio")]
    public IActionResult GetTemporaryAudio(
        string tempId)
    {
        try
        {
            string path =
                _audioRenderService
                    .GetTemporarySamplePath(
                        tempId);

            if (!System.IO.File.Exists(path))
            {
                return NotFound();
            }

            return PhysicalFile(
                path,
                "audio/wav",
                enableRangeProcessing: true);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(
                ex.Message);
        }
    }


[HttpDelete("temp/{tempId}")]
public IActionResult DeleteTemporaryAudio(
    string tempId)
    {
        try
        {
            bool deleted =
                _audioRenderService
                    .DeleteTemporarySample(
                        tempId);

            return deleted
                ? NoContent()
                : NotFound();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(
                ex.Message);
        }
    }
// IMPORTANT:
// This permanently deletes the real audio file from disk,
// then removes the corresponding SampleVault database entry.

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteSample(
        int id)
    {
        AudioSample? sample =
            await _db.Samples
                .FirstOrDefaultAsync(
                    sample =>
                        sample.Id == id);

        if (sample is null)
        {
            return NotFound();
        }

        string filePath =
            sample.FilePath;

        try
        {
            /*
            Delete the actual audio file first.

            If the file was already removed outside
            SampleVault, we still clean up the stale
            database entry below.
            */
            if (
                !string.IsNullOrWhiteSpace(
                    filePath) &&
                System.IO.File.Exists(
                    filePath)
            )
            {
                System.IO.File.Delete(
                    filePath);
            }

            /*
            Only remove the SampleVault entry after
            the physical delete succeeded.

            That way a permission/locking error does
            not leave the Library claiming the file
            was deleted when it still exists.
            */
            _db.Samples.Remove(
                sample);

            await _db.SaveChangesAsync();

            return NoContent();
        }
        catch (
            UnauthorizedAccessException ex)
        {
            return StatusCode(
                StatusCodes
                    .Status403Forbidden,
                $"SampleVault could not delete the file from your computer: {ex.Message}");
        }
        catch (IOException ex)
        {
            return Conflict(
                $"SampleVault could not delete the file because it may be in use or locked: {ex.Message}");
        }
    }

    // This renames BOTH:
    //   1. the real file on disk
    //   2. the AudioSample database fields
    //
    // The existing audio extension is always preserved.

    [HttpPatch("{id:int}/rename")]
    public async Task<IActionResult> RenameSample(
        int id,
        [FromBody] RenameSampleRequest request)
    {
        AudioSample? sample =
            await _db.Samples
                .FirstOrDefaultAsync(
                    sample =>
                        sample.Id == id);

        if (sample is null)
        {
            return NotFound();
        }

        string requestedName =
            request.Name.Trim();

        if (
            string.IsNullOrWhiteSpace(
                requestedName)
        )
        {
            return BadRequest(
                "The sample name cannot be empty.");
        }

        /*
        Do not allow a rename request to escape
        the sample's current directory.
        */
        if (
            requestedName.IndexOfAny(
                Path.GetInvalidFileNameChars())
                >= 0 ||
            requestedName.Contains(
                Path.DirectorySeparatorChar) ||
            requestedName.Contains(
                Path.AltDirectorySeparatorChar)
        )
        {
            return BadRequest(
                "The sample name contains characters that are not allowed in a file name.");
        }

        string extension =
            Path.GetExtension(
                sample.FileName);

        /*
        The UI asks for a name without the
        extension, but tolerate someone typing
        the existing extension anyway.
        */
        if (
            !string.IsNullOrEmpty(
                extension) &&
            requestedName.EndsWith(
                extension,
                StringComparison
                    .OrdinalIgnoreCase)
        )
        {
            requestedName =
                requestedName[
                    ..^extension.Length
                ].TrimEnd();
        }

        if (
            string.IsNullOrWhiteSpace(
                requestedName)
        )
        {
            return BadRequest(
                "The sample name cannot be empty.");
        }

        string newFileName =
            requestedName +
            extension;

        string oldPath =
            sample.FilePath;

        if (
            string.IsNullOrWhiteSpace(
                oldPath) ||
            !System.IO.File.Exists(
                oldPath)
        )
        {
            return NotFound(
                "The audio file no longer exists on disk.");
        }

        string? directory =
            Path.GetDirectoryName(
                oldPath);

        if (
            string.IsNullOrWhiteSpace(
                directory)
        )
        {
            return BadRequest(
                "SampleVault could not determine the sample's folder.");
        }

        string newPath =
            Path.Combine(
                directory,
                newFileName);

        /*
        If nothing actually changed, simply
        return the current information.
        */
        if (
            string.Equals(
                oldPath,
                newPath,
                StringComparison.Ordinal)
        )
        {
            return Ok(new
            {
                sample.Id,
                sample.FileName,
                sample.FilePath,
                sample.RelativePath
            });
        }

        bool samePathIgnoringCase =
            string.Equals(
                oldPath,
                newPath,
                StringComparison
                    .OrdinalIgnoreCase);

        if (
            !samePathIgnoringCase &&
            System.IO.File.Exists(
                newPath)
        )
        {
            return Conflict(
                $"A file named \"{newFileName}\" already exists in this folder.");
        }

        /*
        Preserve the relative folder while
        replacing only its filename.

        Example:
            Kicks\\old.wav
        becomes:
            Kicks\\new.wav
        */
        string relativeDirectory =
            Path.GetDirectoryName(
                sample.RelativePath)
            ?? string.Empty;

        string newRelativePath =
            string.IsNullOrEmpty(
                relativeDirectory)
                ? newFileName
                : Path.Combine(
                    relativeDirectory,
                    newFileName);

        string? temporaryCasePath =
            null;

        try
        {
            /*
            Windows treats file paths as
            case-insensitive. For a rename like:

                kick.wav -> Kick.wav

            use an intermediate filename so the
            capitalization change is guaranteed.
            */
            if (samePathIgnoringCase)
            {
                temporaryCasePath =
                    Path.Combine(
                        directory,
                        $".samplevault-rename-{Guid.NewGuid():N}{extension}");

                System.IO.File.Move(
                    oldPath,
                    temporaryCasePath);

                System.IO.File.Move(
                    temporaryCasePath,
                    newPath);
            }
            else
            {
                System.IO.File.Move(
                    oldPath,
                    newPath);
            }

            sample.FileName =
                newFileName;

            sample.FilePath =
                newPath;

            sample.RelativePath =
                newRelativePath;

            try
            {
                await _db
                    .SaveChangesAsync();
            }
            catch
            {
                /*
                If updating the DB fails after
                the physical file was renamed,
                make a best-effort rollback.
                */
                try
                {
                    if (
                        System.IO.File.Exists(
                            newPath) &&
                        !System.IO.File.Exists(
                            oldPath)
                    )
                    {
                        System.IO.File.Move(
                            newPath,
                            oldPath);
                    }
                }
                catch
                {
                    // Preserve the original DB error.
                }

                throw;
            }

            return Ok(new
            {
                sample.Id,
                sample.FileName,
                sample.FilePath,
                sample.RelativePath
            });
        }
        catch (
            UnauthorizedAccessException ex)
        {
            return StatusCode(
                StatusCodes
                    .Status403Forbidden,
                $"SampleVault could not rename the file: {ex.Message}");
        }
        catch (IOException ex)
        {
            return Conflict(
                $"SampleVault could not rename the file because it may be in use, locked, or the destination already exists: {ex.Message}");
        }
    }

    // It serves a normalized 16-bit PCM WAV specifically
    // for the low-latency Drum Rack.

    [HttpGet("{id:int}/rack-audio")]
    public async Task<IActionResult> GetRackAudio(
        int id)
    {
        AudioSample? sample =
            await _db.Samples
                .FirstOrDefaultAsync(
                    sample =>
                        sample.Id == id);

        if (sample is null)
        {
            return NotFound();
        }

        try
        {
            string rackAudioPath =
                _audioRenderService
                    .GetOrCreateRackAudio(
                        sample.FilePath,
                        sample.Id);

            return PhysicalFile(
                rackAudioPath,
                "audio/wav",
                enableRangeProcessing: true);
        }
        catch (FileNotFoundException ex)
        {
            return NotFound(
                ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(
                StatusCodes
                    .Status500InternalServerError,
                $"SampleVault could not prepare this sample for the Drum Rack: {ex.Message}");
        }
    }


}