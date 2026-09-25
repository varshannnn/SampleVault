using System.Text.Json;
using System.Text.Json.Serialization;
using SampleVault.Api.Infrastructure;

namespace SampleVault.Api.Presets;

/// <summary>
/// Writes preset files atomically so the future VST never reads a
/// half-written JSON file while the desktop app is saving.
/// </summary>
public sealed class PresetFileStore
{
    private readonly SampleVaultStoragePaths _paths;

    private readonly JsonSerializerOptions _jsonOptions =
        new()
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition =
                JsonIgnoreCondition.WhenWritingNull
        };

    public PresetFileStore(
        SampleVaultStoragePaths paths)
    {
        _paths = paths;
    }

    public Task<string> SaveMelodicAsync(
        MelodicPresetFile preset,
        CancellationToken cancellationToken = default)
    {
        preset.Version =
            SampleVaultPresetFormat.CurrentVersion;

        preset.Type = "melodic";
        preset.UpdatedAtUtc = DateTime.UtcNow;

        var filePath = Path.Combine(
            _paths.MelodicPresets,
            $"{preset.Id:N}.json");

        return WriteAtomicallyAsync(
            filePath,
            preset,
            cancellationToken);
    }

    public Task<string> SaveDrumRackAsync(
        DrumRackPresetFile preset,
        CancellationToken cancellationToken = default)
    {
        preset.Version =
            SampleVaultPresetFormat.CurrentVersion;

        preset.Type = "drumRack";
        preset.UpdatedAtUtc = DateTime.UtcNow;

        var filePath = Path.Combine(
            _paths.DrumRackPresets,
            $"{preset.Id:N}.json");

        return WriteAtomicallyAsync(
            filePath,
            preset,
            cancellationToken);
    }

    public bool DeleteMelodic(
        Guid id)
    {
        var path = Path.Combine(
            _paths.MelodicPresets,
            $"{id:N}.json");

        return DeleteIfExists(path);
    }

    public bool DeleteDrumRack(
        Guid id)
    {
        var path = Path.Combine(
            _paths.DrumRackPresets,
            $"{id:N}.json");

        return DeleteIfExists(path);
    }

    private async Task<string> WriteAtomicallyAsync<T>(
        string finalPath,
        T value,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(
            Path.GetDirectoryName(finalPath)!);

        var tempPath =
            finalPath + ".tmp";

        await using (var stream =
            new FileStream(
                tempPath,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 4096,
                useAsync: true))
        {
            await JsonSerializer.SerializeAsync(
                stream,
                value,
                _jsonOptions,
                cancellationToken);

            await stream.FlushAsync(
                cancellationToken);
        }

        File.Move(
            tempPath,
            finalPath,
            overwrite: true);

        return finalPath;
    }

    private static bool DeleteIfExists(
        string path)
    {
        if (!File.Exists(path))
        {
            return false;
        }

        File.Delete(path);
        return true;
    }
}
