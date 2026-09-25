using System.Security.Cryptography;
using SampleVault.Api.Infrastructure;

namespace SampleVault.Api.Presets;

/// <summary>
/// Copies private rendered audio into the durable, application-wide
/// SampleVault Assets directory using a content hash.
///
/// The same audio bytes always map to the same asset filename.
/// </summary>
public sealed class ManagedAudioAssetStore
{
    private readonly SampleVaultStoragePaths _paths;

    public ManagedAudioAssetStore(
        SampleVaultStoragePaths paths)
    {
        _paths = paths;
    }

    public async Task<AudioSourceRef>
        ImportAsync(
            string sourcePath,
            CancellationToken cancellationToken = default)
    {
        if (!File.Exists(sourcePath))
        {
            throw new FileNotFoundException(
                "Audio source does not exist.",
                sourcePath);
        }

        Directory.CreateDirectory(
            _paths.AssetsRoot);

        string extension =
            Path.GetExtension(sourcePath);

        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".wav";
        }

        string hashHex;

        await using (
            var stream =
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
                Convert.ToHexString(hash)
                    .ToLowerInvariant();
        }

        string fileName =
            $"{hashHex}{extension.ToLowerInvariant()}";

        string destination =
            Path.Combine(
                _paths.AssetsRoot,
                fileName);

        if (!File.Exists(destination))
        {
            string tempPath =
                Path.Combine(
                    _paths.AssetsRoot,
                    $".{Guid.NewGuid():N}.tmp");

            try
            {
                await using (
                    var source =
                        new FileStream(
                            sourcePath,
                            FileMode.Open,
                            FileAccess.Read,
                            FileShare.Read,
                            bufferSize: 81920,
                            useAsync: true))
                await using (
                    var target =
                        new FileStream(
                            tempPath,
                            FileMode.CreateNew,
                            FileAccess.Write,
                            FileShare.None,
                            bufferSize: 81920,
                            useAsync: true))
                {
                    await source.CopyToAsync(
                        target,
                        cancellationToken);

                    await target.FlushAsync(
                        cancellationToken);
                }

                try
                {
                    File.Move(
                        tempPath,
                        destination,
                        overwrite: false);
                }
                catch (IOException)
                {
                    if (!File.Exists(destination))
                    {
                        throw;
                    }
                }
            }
            finally
            {
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch
                {
                    // Non-fatal scratch cleanup.
                }
            }
        }

        return new AudioSourceRef
        {
            Kind = "managedAsset",
            Path = $"Assets/{fileName}"
        };
    }

    public string ResolvePath(
        AudioSourceRef audio)
    {
        if (audio.Kind == "externalFile")
        {
            return Path.GetFullPath(
                audio.Path);
        }

        if (audio.Kind != "managedAsset")
        {
            throw new InvalidOperationException(
                $"Unsupported audio source kind: {audio.Kind}");
        }

        string relative =
            audio.Path
                .Replace('/', Path.DirectorySeparatorChar);

        string fullPath =
            Path.GetFullPath(
                Path.Combine(
                    _paths.Root,
                    relative));

        string root =
            Path.GetFullPath(
                _paths.Root)
                .TrimEnd(
                    Path.DirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        if (
            !fullPath.StartsWith(
                root,
                StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Managed asset path escaped the SampleVault storage root.");
        }

        return fullPath;
    }
}
