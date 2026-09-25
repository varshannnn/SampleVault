using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Data;
using SampleVault.Api.Models;
using SampleVault.Api.Services;

namespace SampleVault.Api.Controllers;

[ApiController]
[Route("api/drum-rack-presets")]
public class DrumRackPresetsController
    : ControllerBase
{
    private readonly SampleVaultDbContext _db;
    private readonly AudioRenderService
        _audioRenderService;

    private readonly string
        _rackAssetsFolder;

    public DrumRackPresetsController(
        SampleVaultDbContext db,
        AudioRenderService audioRenderService,
        IWebHostEnvironment environment)
    {
        _db = db;
        _audioRenderService =
            audioRenderService;

        _rackAssetsFolder =
            Path.Combine(
                environment.ContentRootPath,
                "rack-assets");
    }

    [HttpGet]
    public async Task<IActionResult>
        GetPresets()
    {
        var presets =
            await _db
                .Set<DrumRackPreset>()
                .OrderBy(
                    preset =>
                        preset.Name)
                .Select(
                    preset => new
                    {
                        preset.Id,
                        preset.Name,
                        preset.CreatedAt,
                        preset.UpdatedAt,
                        SlotCount =
                            preset.Slots
                                .Count
                    })
                .ToListAsync();

        return Ok(presets);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult>
        GetPreset(
            int id)
    {
        DrumRackPreset? preset =
            await _db
                .Set<DrumRackPreset>()
                .Include(
                    preset =>
                        preset.Slots)
                    .ThenInclude(
                        slot =>
                            slot.AudioSample)
                        .ThenInclude(
                            sample =>
                                sample!.Tags)
                .FirstOrDefaultAsync(
                    preset =>
                        preset.Id == id);

        if (preset is null)
        {
            return NotFound();
        }

        var slots =
            preset.Slots
                .OrderBy(
                    slot =>
                        slot.SlotIndex)
                .Select(
                    slot =>
                    {
                        if (
                            slot.SourceKind ==
                                "library" &&
                            slot.AudioSample is
                                not null)
                        {
                            return new
                            {
                                slotIndex =
                                    slot.SlotIndex,

                                rackId =
                                    $"library-{slot.AudioSample.Id}",

                                sourceKind =
                                    "library",

                                sampleId =
                                    (int?)slot
                                        .AudioSample
                                        .Id,

                                tempId =
                                    (string?)null,

                                rackAssetSlotId =
                                    (int?)null,

                                fileName =
                                    slot.AudioSample
                                        .FileName,

                                durationSeconds =
                                    slot.AudioSample
                                        .DurationSeconds,

                                tags =
                                    slot.AudioSample
                                        .Tags
                                        .Select(
                                            tag =>
                                                tag.Name)
                                        .OrderBy(
                                            tag =>
                                                tag)
                                        .ToList(),

                                audioUrl =
                                    $"http://localhost:5085/api/samples/{slot.AudioSample.Id}/rack-audio"
                            };
                        }

                        return new
                        {
                            slotIndex =
                                slot.SlotIndex,

                            rackId =
                                $"rackasset-{slot.Id}",

                            sourceKind =
                                "rackAsset",

                            sampleId =
                                (int?)null,

                            tempId =
                                (string?)null,

                            rackAssetSlotId =
                                (int?)slot.Id,

                            fileName =
                                slot.FileName,

                            durationSeconds =
                                slot.DurationSeconds,

                            tags =
                                DeserializeTags(
                                    slot.TagsJson),

                            audioUrl =
                                $"http://localhost:5085/api/drum-rack-presets/assets/{slot.Id}/audio"
                        };
                    })
                .ToList();

        return Ok(new
        {
            preset.Id,
            preset.Name,
            preset.CreatedAt,
            preset.UpdatedAt,
            slots
        });
    }

    /*
      Save by name.

      Saving the same name again updates that
      preset instead of creating duplicates.
    */
    [HttpPost("save")]
    public async Task<IActionResult>
        SavePreset(
            [FromBody]
            SaveDrumRackPresetRequest
                request)
    {
        string name =
            request.Name.Trim();

        if (
            string.IsNullOrWhiteSpace(
                name)
        )
        {
            return BadRequest(
                "Give the Drum Rack a name first.");
        }

        if (
            request.Slots.Any(
                slot =>
                    slot.SlotIndex < 0 ||
                    slot.SlotIndex > 15)
        )
        {
            return BadRequest(
                "Drum Rack slot indexes must be between 0 and 15.");
        }

        if (
            request.Slots
                .GroupBy(
                    slot =>
                        slot.SlotIndex)
                .Any(
                    group =>
                        group.Count() > 1)
        )
        {
            return BadRequest(
                "A Drum Rack preset cannot contain two sounds on the same pad.");
        }

        Directory.CreateDirectory(
            _rackAssetsFolder);

        DrumRackPreset? preset =
            await _db
                .Set<DrumRackPreset>()
                .Include(
                    preset =>
                        preset.Slots)
                .FirstOrDefaultAsync(
                    preset =>
                        preset.Name == name);

        bool created =
            preset is null;

        if (preset is null)
        {
            preset =
                new DrumRackPreset
                {
                    Name = name
                };

            _db
                .Set<DrumRackPreset>()
                .Add(
                    preset);
        }

        /*
          Any temporary/rackAsset sounds must
          become stable private files before the
          preset can be considered persistent.
        */
        var newAssetPaths =
            new List<string>();

        var preparedSlots =
            new List<
                DrumRackPresetSlot>();

        try
        {
            foreach (
                SaveDrumRackSlotRequest
                    requestedSlot
                in request.Slots)
            {
                if (
                    requestedSlot
                        .SourceKind ==
                    "library")
                {
                    if (
                        requestedSlot
                            .SampleId is
                        not int sampleId)
                    {
                        return BadRequest(
                            "A Library rack sound is missing its sample ID.");
                    }

                    AudioSample? sample =
                        await _db
                            .Samples
                            .FirstOrDefaultAsync(
                                sample =>
                                    sample.Id ==
                                    sampleId);

                    if (sample is null)
                    {
                        return BadRequest(
                            $"Library sample #{sampleId} no longer exists.");
                    }

                    preparedSlots.Add(
                        new DrumRackPresetSlot
                        {
                            SlotIndex =
                                requestedSlot
                                    .SlotIndex,

                            SourceKind =
                                "library",

                            AudioSampleId =
                                sample.Id,

                            FileName =
                                sample.FileName,

                            FilePath =
                                sample.FilePath,

                            DurationSeconds =
                                sample
                                    .DurationSeconds,

                            TagsJson =
                                JsonSerializer
                                    .Serialize(
                                        requestedSlot
                                            .Tags)
                        });

                    continue;
                }

                string sourcePath;

                if (
                    requestedSlot
                        .SourceKind ==
                    "temporary")
                {
                    if (
                        string
                            .IsNullOrWhiteSpace(
                                requestedSlot
                                    .TempId)
                    )
                    {
                        return BadRequest(
                            "A temporary rack sound is missing its temporary ID.");
                    }

                    sourcePath =
                        _audioRenderService
                            .GetTemporarySamplePath(
                                requestedSlot
                                    .TempId);
                }
                else if (
                    requestedSlot
                        .SourceKind ==
                    "rackAsset")
                {
                    if (
                        requestedSlot
                            .RackAssetSlotId is
                        not int
                            sourceRackSlotId)
                    {
                        return BadRequest(
                            "A saved rack asset is missing its source slot ID.");
                    }

                    DrumRackPresetSlot?
                        sourceSlot =
                            await _db
                                .Set<
                                    DrumRackPresetSlot>()
                                .FirstOrDefaultAsync(
                                    slot =>
                                        slot.Id ==
                                        sourceRackSlotId &&
                                        slot.SourceKind ==
                                        "rackAsset");

                    if (sourceSlot is null)
                    {
                        return BadRequest(
                            "One of the saved rack assets no longer exists.");
                    }

                    sourcePath =
                        sourceSlot
                            .FilePath;
                }
                else
                {
                    return BadRequest(
                        $"Unknown rack source kind: {requestedSlot.SourceKind}");
                }

                if (
                    !System.IO.File.Exists(
                        sourcePath)
                )
                {
                    return BadRequest(
                        $"Rack sound \"{requestedSlot.FileName}\" no longer exists on disk.");
                }

                string extension =
                    Path.GetExtension(
                        sourcePath);

                if (
                    string.IsNullOrWhiteSpace(
                        extension)
                )
                {
                    extension = ".wav";
                }

                string assetPath =
                    Path.Combine(
                        _rackAssetsFolder,
                        $"{Guid.NewGuid():N}{extension}");

                System.IO.File.Copy(
                    sourcePath,
                    assetPath,
                    overwrite: false);

                newAssetPaths.Add(
                    assetPath);

                preparedSlots.Add(
                    new DrumRackPresetSlot
                    {
                        SlotIndex =
                            requestedSlot
                                .SlotIndex,

                        SourceKind =
                            "rackAsset",

                        AudioSampleId =
                            null,

                        FileName =
                            requestedSlot
                                .FileName,

                        FilePath =
                            assetPath,

                        DurationSeconds =
                            requestedSlot
                                .DurationSeconds,

                        TagsJson =
                            JsonSerializer
                                .Serialize(
                                    requestedSlot
                                        .Tags)
                    });
            }

            /*
              Keep the old stable asset paths so
              we can remove them only AFTER the
              replacement preset saves.
            */
            var oldAssetPaths =
                preset.Slots
                    .Where(
                        slot =>
                            slot.SourceKind ==
                            "rackAsset")
                    .Select(
                        slot =>
                            slot.FilePath)
                    .Where(
                        path =>
                            !string
                                .IsNullOrWhiteSpace(
                                    path))
                    .ToList();

            _db
                .Set<DrumRackPresetSlot>()
                .RemoveRange(
                    preset.Slots);

            preset.Slots =
                preparedSlots;

            preset.Name = name;
            preset.UpdatedAt =
                DateTime.UtcNow;

            if (created)
            {
                preset.CreatedAt =
                    preset.UpdatedAt;
            }

            await _db
                .SaveChangesAsync();

            foreach (
                string oldAssetPath
                in oldAssetPaths)
            {
                TryDeleteFile(
                    oldAssetPath);
            }

            return Ok(new
            {
                preset.Id,
                preset.Name,
                SlotCount =
                    preset.Slots.Count,
                preset.UpdatedAt
            });
        }
        catch
        {
            /*
              Do not leave newly copied private
              rack assets behind if saving fails.
            */
            foreach (
                string path
                in newAssetPaths)
            {
                TryDeleteFile(
                    path);
            }

            throw;
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult>
        DeletePreset(
            int id)
    {
        DrumRackPreset? preset =
            await _db
                .Set<DrumRackPreset>()
                .Include(
                    preset =>
                        preset.Slots)
                .FirstOrDefaultAsync(
                    preset =>
                        preset.Id == id);

        if (preset is null)
        {
            return NotFound();
        }

        var assetPaths =
            preset.Slots
                .Where(
                    slot =>
                        slot.SourceKind ==
                        "rackAsset")
                .Select(
                    slot =>
                        slot.FilePath)
                .ToList();

        _db
            .Set<DrumRackPreset>()
            .Remove(
                preset);

        await _db
            .SaveChangesAsync();

        foreach (
            string path
            in assetPaths)
        {
            TryDeleteFile(
                path);
        }

        return NoContent();
    }

    [HttpGet(
        "assets/{slotId:int}/audio")]
    public async Task<IActionResult>
        GetRackAssetAudio(
            int slotId)
    {
        DrumRackPresetSlot? slot =
            await _db
                .Set<DrumRackPresetSlot>()
                .FirstOrDefaultAsync(
                    slot =>
                        slot.Id ==
                            slotId &&
                        slot.SourceKind ==
                            "rackAsset");

        if (
            slot is null ||
            !System.IO.File.Exists(
                slot.FilePath)
        )
        {
            return NotFound();
        }

        return PhysicalFile(
            slot.FilePath,
            "audio/wav",
            enableRangeProcessing: true);
    }

    private static List<string>
        DeserializeTags(
            string tagsJson)
    {
        try
        {
            return JsonSerializer
                .Deserialize<
                    List<string>>(
                        tagsJson)
                ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static void TryDeleteFile(
        string path)
    {
        try
        {
            if (
                !string.IsNullOrWhiteSpace(
                    path) &&
                System.IO.File.Exists(
                    path)
            )
            {
                System.IO.File.Delete(
                    path);
            }
        }
        catch
        {
            /*
              A stale private asset is preferable
              to breaking preset deletion/save.
            */
        }
    }
}
