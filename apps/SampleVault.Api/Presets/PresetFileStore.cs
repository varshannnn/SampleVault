using System.Text.Json;
using System.Text.Json.Serialization;
using SampleVault.Api.Infrastructure;

namespace SampleVault.Api.Presets;

/// <summary>
/// Atomic portable-preset storage shared by the app and future VST.
/// </summary>
public sealed class PresetFileStore
{
    private readonly SampleVaultStoragePaths _paths;

    private readonly JsonSerializerOptions _jsonOptions =
        new()
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
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

    public async Task<MelodicPresetFile?>
        LoadMelodicAsync(
            Guid id,
            CancellationToken cancellationToken = default)
    {
        string path = Path.Combine(
            _paths.MelodicPresets,
            $"{id:N}.json");

        if (!File.Exists(path))
        {
            return null;
        }

        await using var stream =
            new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                bufferSize: 4096,
                useAsync: true);

        return await JsonSerializer
            .DeserializeAsync<MelodicPresetFile>(
                stream,
                _jsonOptions,
                cancellationToken);
    }

    public async Task<List<MelodicPresetFile>>
        ListMelodicAsync(
            CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(
            _paths.MelodicPresets);

        var presets =
            new List<MelodicPresetFile>();

        foreach (
            string path in
            Directory.EnumerateFiles(
                _paths.MelodicPresets,
                "*.json"))
        {
            try
            {
                await using var stream =
                    new FileStream(
                        path,
                        FileMode.Open,
                        FileAccess.Read,
                        FileShare.Read,
                        bufferSize: 4096,
                        useAsync: true);

                MelodicPresetFile? preset =
                    await JsonSerializer
                        .DeserializeAsync<MelodicPresetFile>(
                            stream,
                            _jsonOptions,
                            cancellationToken);

                if (
                    preset is not null &&
                    preset.Type == "melodic")
                {
                    presets.Add(preset);
                }
            }
            catch (JsonException)
            {
                /*
                  One malformed preset should not make the whole
                  preset browser unusable. We can surface corrupt
                  files more explicitly later.
                */
            }
        }

        return presets
            .OrderBy(
                preset =>
                    preset.Name)
            .ThenBy(
                preset =>
                    preset.Id)
            .ToList();
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
