using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SampleVault.Api.Infrastructure;
using SampleVault.Api.Models;

namespace SampleVault.Api.Presets;

/// <summary>
/// Converts the existing SQLite Drum Rack preset into the portable,
/// file-based format that the future VST3 can read directly.
///
/// Transitional architecture:
///
///   SQLite preset
///       ↓
///   DrumRackPresetExporter
///       ├── external Library WAV paths
///       ├── managed private audio assets
///       └── versioned JSON preset
///
/// SQLite remains the source used by the current React/.NET app for now.
/// </summary>
public sealed class DrumRackPresetExporter
{
    private readonly SampleVaultStoragePaths _paths;
    private readonly PresetFileStore _fileStore;

    public DrumRackPresetExporter(
        SampleVaultStoragePaths paths,
        PresetFileStore fileStore)
    {
        _paths = paths;
        _fileStore = fileStore;
    }

    /// <summary>
    /// Export/update one SQLite Drum Rack preset.
    ///
    /// The exported GUID is deterministic from the SQLite ID, so saving
    /// preset #4 repeatedly updates the same JSON file rather than creating
    /// a new file every time.
    /// </summary>
    public async Task<string> ExportAsync(
        DrumRackPreset preset,
        CancellationToken cancellationToken = default)
    {
        var portablePreset =
            new DrumRackPresetFile
            {
                Id =
                    GetStablePresetGuid(
                        preset.Id),

                Name =
                    preset.Name,

                UpdatedAtUtc =
                    preset.UpdatedAt,

                Slots = []
            };

        foreach (
            DrumRackPresetSlot slot
            in preset.Slots
                .OrderBy(
                    slot =>
                        slot.SlotIndex))
        {
            AudioSourceRef audio;

            if (
                slot.SourceKind ==
                "library")
            {
                if (
                    string.IsNullOrWhiteSpace(
                        slot.FilePath)
                )
                {
                    throw new InvalidOperationException(
                        $"Rack slot {slot.SlotIndex} has no Library file path.");
                }

                /*
                  Library samples are already durable files on disk.
                  Do NOT duplicate the user's entire sample library.
                */
                audio =
                    new AudioSourceRef
                    {
                        Kind =
                            "externalFile",

                        Path =
                            Path.GetFullPath(
                                slot.FilePath)
                    };
            }
            else if (
                slot.SourceKind ==
                "rackAsset")
            {
                if (
                    string.IsNullOrWhiteSpace(
                        slot.FilePath) ||
                    !File.Exists(
                        slot.FilePath)
                )
                {
                    throw new FileNotFoundException(
                        $"Rack asset for slot {slot.SlotIndex} does not exist.",
                        slot.FilePath);
                }

                /*
                  rack-assets/ currently lives inside the API project.
                  That is fine for the current app but not for a VST.

                  Copy the sound into SampleVault's application-wide
                  managed Assets folder and reference it from there.
                */
                string relativeAssetPath =
                    await EnsureManagedAssetAsync(
                        slot.FilePath,
                        cancellationToken);

                audio =
                    new AudioSourceRef
                    {
                        Kind =
                            "managedAsset",

                        Path =
                            relativeAssetPath
                    };
            }
            else
            {
                throw new InvalidOperationException(
                    $"Unsupported stored rack source kind: {slot.SourceKind}");
            }

            portablePreset.Slots.Add(
                new DrumRackSlotFile
                {
                    SlotIndex =
                        slot.SlotIndex,

                    Audio =
                        audio,

                    FileName =
                        slot.FileName,

                    DurationSeconds =
                        slot.DurationSeconds,

                    Tags =
                        DeserializeTags(
                            slot.TagsJson)
                });
        }

        return await _fileStore
            .SaveDrumRackAsync(
                portablePreset,
                cancellationToken);
    }

    /// <summary>
    /// Remove the portable JSON when the SQLite preset is deleted.
    ///
    /// Managed assets are content-addressed and may be shared by more than
    /// one preset, so we intentionally do not delete them here. We can add
    /// a safe orphan/garbage collector later.
    /// </summary>
    public bool DeleteExport(
        int sqlitePresetId)
    {
        return _fileStore
            .DeleteDrumRack(
                GetStablePresetGuid(
                    sqlitePresetId));
    }

    /// <summary>
    /// Convert a source audio file into a stable, content-addressed
    /// SampleVault asset:
    ///
    ///   Assets/{sha256}.{extension}
    ///
    /// Identical audio therefore gets copied only once.
    /// </summary>
    private async Task<string>
        EnsureManagedAssetAsync(
            string sourcePath,
            CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(
            _paths.AssetsRoot);

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

        string hashHex;

        await using (
            FileStream stream =
                new FileStream(
                    sourcePath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.Read,
                    bufferSize: 81920,
                    useAsync: true))
        {
            byte[] hash =
                await SHA256.HashDataAsync(
                    stream,
                    cancellationToken);

            hashHex =
                Convert.ToHexString(
                    hash)
                .ToLowerInvariant();
        }

        string fileName =
            $"{hashHex}{extension.ToLowerInvariant()}";

        string targetPath =
            Path.Combine(
                _paths.AssetsRoot,
                fileName);

        if (
            !File.Exists(
                targetPath)
        )
        {
            string tempPath =
                Path.Combine(
                    _paths.AssetsRoot,
                    $".{Guid.NewGuid():N}.tmp");

            try
            {
                await using (
                    FileStream source =
                        new FileStream(
                            sourcePath,
                            FileMode.Open,
                            FileAccess.Read,
                            FileShare.Read,
                            bufferSize: 81920,
                            useAsync: true))
                await using (
                    FileStream destination =
                        new FileStream(
                            tempPath,
                            FileMode.CreateNew,
                            FileAccess.Write,
                            FileShare.None,
                            bufferSize: 81920,
                            useAsync: true))
                {
                    await source.CopyToAsync(
                        destination,
                        cancellationToken);

                    await destination.FlushAsync(
                        cancellationToken);
                }

                try
                {
                    File.Move(
                        tempPath,
                        targetPath,
                        overwrite: false);
                }
                catch (IOException)
                {
                    /*
                      If another save created the exact same hashed
                      asset first, that is fine. Reuse it.
                    */
                    if (
                        !File.Exists(
                            targetPath)
                    )
                    {
                        throw;
                    }
                }
            }
            finally
            {
                TryDeleteFile(
                    tempPath);
            }
        }

        /*
          JSON uses forward slashes so JUCE/C++ can treat the preset
          format consistently on Windows and other future platforms.
        */
        return
            $"Assets/{fileName}";
    }

    private static Guid
        GetStablePresetGuid(
            int sqlitePresetId)
    {
        byte[] input =
            Encoding.UTF8.GetBytes(
                $"samplevault:drum-rack:sqlite:{sqlitePresetId}");

        byte[] hash =
            SHA256.HashData(
                input);

        byte[] guidBytes =
            hash[..16];

        /*
          Make it look like a normal deterministic UUID:
          version 5 + RFC 4122 variant bits.
        */
        guidBytes[6] =
            (byte)(
                (
                    guidBytes[6] &
                    0x0F
                ) |
                0x50);

        guidBytes[8] =
            (byte)(
                (
                    guidBytes[8] &
                    0x3F
                ) |
                0x80);

        return new Guid(
            guidBytes);
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

    private static void
        TryDeleteFile(
            string path)
    {
        try
        {
            if (
                !string.IsNullOrWhiteSpace(
                    path) &&
                File.Exists(
                    path)
            )
            {
                File.Delete(
                    path);
            }
        }
        catch
        {
            /*
              A stale .tmp file is preferable to failing a preset save.
            */
        }
    }
}
