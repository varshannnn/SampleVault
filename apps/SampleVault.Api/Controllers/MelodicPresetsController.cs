using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SampleVault.Api.Data;
using SampleVault.Api.Models;
using SampleVault.Api.Presets;
using SampleVault.Api.Services;

namespace SampleVault.Api.Controllers;

[ApiController]
[Route("api/melodic-presets")]
public sealed class MelodicPresetsController
    : ControllerBase
{
    private readonly SampleVaultDbContext _db;
    private readonly PresetFileStore _presetStore;
    private readonly ManagedAudioAssetStore _assetStore;
    private readonly AudioRenderService _audioRenderService;

    public MelodicPresetsController(
        SampleVaultDbContext db,
        PresetFileStore presetStore,
        ManagedAudioAssetStore assetStore,
        AudioRenderService audioRenderService)
    {
        _db = db;
        _presetStore = presetStore;
        _assetStore = assetStore;
        _audioRenderService = audioRenderService;
    }

    /*
      Unlike Drum Rack presets, Melodic presets did not have an old
      SQLite format to preserve. We therefore start them directly in
      the portable file format instead of creating another DB table
      that we would immediately need to migrate away from.
    */
    [HttpGet]
    public async Task<IActionResult>
        GetPresets(
            CancellationToken cancellationToken)
    {
        List<MelodicPresetFile> presets =
            await _presetStore
                .ListMelodicAsync(
                    cancellationToken);

        return Ok(
            presets.Select(
                preset => new
                {
                    preset.Id,
                    preset.Name,
                    preset.UpdatedAtUtc,
                    preset.FileName
                }));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult>
        GetPreset(
            Guid id,
            CancellationToken cancellationToken)
    {
        MelodicPresetFile? preset =
            await _presetStore
                .LoadMelodicAsync(
                    id,
                    cancellationToken);

        if (preset is null)
        {
            return NotFound();
        }

        return Ok(
            ToFrontendPreset(preset));
    }

    [HttpGet("{id:guid}/audio")]
    public async Task<IActionResult>
        GetPresetAudio(
            Guid id,
            CancellationToken cancellationToken)
    {
        MelodicPresetFile? preset =
            await _presetStore
                .LoadMelodicAsync(
                    id,
                    cancellationToken);

        if (preset is null)
        {
            return NotFound();
        }

        string filePath =
            _assetStore.ResolvePath(
                preset.Audio);

        if (!System.IO.File.Exists(filePath))
        {
            return NotFound(
                "The preset's audio file no longer exists.");
        }

        return PhysicalFile(
            filePath,
            "audio/wav",
            enableRangeProcessing: true);
    }

    [HttpPost]
    public async Task<IActionResult>
        SavePreset(
            [FromBody]
            SaveMelodicPresetRequest request,
            CancellationToken cancellationToken)
    {
        string name =
            request.Name.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(
                "Preset name is required.");
        }

        if (
            request.VoiceMode != "mono" &&
            request.VoiceMode != "poly")
        {
            return BadRequest(
                "VoiceMode must be mono or poly.");
        }

        AudioSourceRef audio;

        if (request.SourceKind == "library")
        {
            if (!request.SampleId.HasValue)
            {
                return BadRequest(
                    "Library source requires SampleId.");
            }

            AudioSample? sample =
                await _db.Samples
                    .FirstOrDefaultAsync(
                        sample =>
                            sample.Id ==
                            request.SampleId.Value,
                        cancellationToken);

            if (sample is null)
            {
                return BadRequest(
                    "Library sample was not found.");
            }

            if (!System.IO.File.Exists(sample.FilePath))
            {
                return BadRequest(
                    "Library sample file no longer exists.");
            }

            audio = new AudioSourceRef
            {
                Kind = "externalFile",
                Path = Path.GetFullPath(
                    sample.FilePath)
            };
        }
        else if (
            request.SourceKind == "temporary")
        {
            if (
                string.IsNullOrWhiteSpace(
                    request.TempId))
            {
                return BadRequest(
                    "Temporary source requires TempId.");
            }

            string tempPath;

            try
            {
                tempPath =
                    _audioRenderService
                        .GetTemporarySamplePath(
                            request.TempId);
            }
            catch (ArgumentException error)
            {
                return BadRequest(
                    error.Message);
            }

            if (!System.IO.File.Exists(tempPath))
            {
                return BadRequest(
                    "Temporary Lab render no longer exists.");
            }

            audio =
                await _assetStore
                    .ImportAsync(
                        tempPath,
                        cancellationToken);
        }
        else if (
            request.SourceKind == "savedPreset")
        {
            if (!request.SourcePresetId.HasValue)
            {
                return BadRequest(
                    "Saved preset source requires SourcePresetId.");
            }

            MelodicPresetFile? sourcePreset =
                await _presetStore
                    .LoadMelodicAsync(
                        request.SourcePresetId.Value,
                        cancellationToken);

            if (sourcePreset is null)
            {
                return BadRequest(
                    "Source melodic preset was not found.");
            }

            /*
              Content-addressed managed assets are immutable and safe
              to share between multiple preset JSON files.
            */
            audio = new AudioSourceRef
            {
                Kind = sourcePreset.Audio.Kind,
                Path = sourcePreset.Audio.Path
            };
        }
        else
        {
            return BadRequest(
                $"Unsupported source kind: {request.SourceKind}");
        }

        Guid presetId =
            request.Id ??
            Guid.NewGuid();

        var preset =
            new MelodicPresetFile
            {
                Id = presetId,
                Name = name,

                Audio = audio,

                FileName =
                    request.FileName,

                DurationSeconds =
                    Math.Max(
                        0,
                        request.DurationSeconds),

                Tags =
                    request.Tags
                        .Where(
                            tag =>
                                !string.IsNullOrWhiteSpace(tag))
                        .Select(
                            tag =>
                                tag.Trim())
                        .Distinct(
                            StringComparer.OrdinalIgnoreCase)
                        .ToList(),

                RootMidiNote =
                    Math.Clamp(
                        request.RootMidiNote,
                        0,
                        127),

                TransposeSemitones =
                    Math.Clamp(
                        request.TransposeSemitones,
                        -48,
                        48),

                FineTuneCents =
                    Math.Clamp(
                        request.FineTuneCents,
                        -100,
                        100),

                VoiceMode =
                    request.VoiceMode,

                GlideMs =
                    Math.Clamp(
                        request.GlideMs,
                        0,
                        2000),

                LoopWhileHeld =
                    request.LoopWhileHeld,

                Loop =
                    new LoopSettings
                    {
                        Enabled =
                            request.HasCustomLoop,

                        StartSeconds =
                            Math.Max(
                                0,
                                request.LoopStartSeconds),

                        EndSeconds =
                            Math.Max(
                                0,
                                request.LoopEndSeconds),

                        AutoSmooth =
                            request.LoopAutoSmooth,

                        CrossfadeMs =
                            Math.Clamp(
                                request.LoopCrossfadeMs,
                                0,
                                100)
                    },

                AmpEnvelope =
                    new AmpEnvelopeSettings
                    {
                        AttackMs =
                            Math.Clamp(
                                request.AttackMs,
                                0,
                                5000),

                        DecayMs =
                            Math.Clamp(
                                request.DecayMs,
                                0,
                                5000),

                        Sustain =
                            Math.Clamp(
                                request.SustainPercent /
                                100.0,
                                0,
                                1),

                        ReleaseMs =
                            Math.Clamp(
                                request.ReleaseMs,
                                0,
                                10000)
                    },

                GainDb =
                    Math.Clamp(
                        request.GainDb,
                        -36,
                        12)
            };

        string filePath =
            await _presetStore
                .SaveMelodicAsync(
                    preset,
                    cancellationToken);

        return Ok(new
        {
            preset.Id,
            preset.Name,
            preset.UpdatedAtUtc,
            PresetPath = filePath
        });
    }

    [HttpDelete("{id:guid}")]
    public IActionResult DeletePreset(
        Guid id)
    {
        bool deleted =
            _presetStore
                .DeleteMelodic(id);

        return deleted
            ? NoContent()
            : NotFound();
    }

    private object ToFrontendPreset(
        MelodicPresetFile preset)
    {
        return new
        {
            preset.Id,
            preset.Name,
            preset.UpdatedAtUtc,

            Sound = new
            {
                SourceId =
                    $"preset-{preset.Id:N}",

                SourceKind =
                    "savedPreset",

                SampleId =
                    (int?)null,

                TempId =
                    (string?)null,

                SavedPresetId =
                    preset.Id,

                PresetName =
                    preset.Name,

                preset.FileName,
                preset.DurationSeconds,
                preset.Tags,

                AudioUrl =
                    $"/api/melodic-presets/{preset.Id}/audio",

                LoopStartSeconds =
                    preset.Loop.Enabled
                        ? preset.Loop.StartSeconds
                        : (double?)null,

                LoopEndSeconds =
                    preset.Loop.Enabled
                        ? preset.Loop.EndSeconds
                        : (double?)null,

                LoopCrossfadeMs =
                    preset.Loop.CrossfadeMs,

                LoopAutoSmooth =
                    preset.Loop.AutoSmooth,

                preset.RootMidiNote,
                preset.TransposeSemitones,
                preset.FineTuneCents,
                preset.VoiceMode,
                preset.GlideMs,
                preset.LoopWhileHeld,

                AttackMs =
                    preset.AmpEnvelope.AttackMs,

                DecayMs =
                    preset.AmpEnvelope.DecayMs,

                SustainPercent =
                    preset.AmpEnvelope.Sustain *
                    100.0,

                ReleaseMs =
                    preset.AmpEnvelope.ReleaseMs,

                preset.GainDb
            }
        };
    }
}
