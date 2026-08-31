using Microsoft.EntityFrameworkCore;
using NAudio.Wave;
using SampleVault.Api.Data;
using SampleVault.Api.Models;

namespace SampleVault.Api.Services;

public class SampleScanner
{
    private readonly SampleVaultDbContext _db;

    public SampleScanner(SampleVaultDbContext db)
    {
        _db = db;
    }

    public async Task<int> ScanFolderAsync(string folderPath)
    {
        if (!Directory.Exists(folderPath))
        {
            throw new DirectoryNotFoundException(
                $"Folder does not exist: {folderPath}");
        }

        string[] files = Directory.GetFiles(
            folderPath,
            "*.wav",
            SearchOption.AllDirectories);

        int addedCount = 0;

        foreach (string filePath in files)
        {
            string fullPath = Path.GetFullPath(filePath);

            string relativePath = Path.GetRelativePath(folderPath, fullPath);

            string category =
                Directory.GetParent(fullPath)?.Name ?? "Uncategorized";

            bool alreadyExists = await _db.Samples
                .AnyAsync(sample => sample.FilePath == fullPath);

            if (alreadyExists)
            {
                continue;
            }

            using var reader = new AudioFileReader(fullPath);

            var sample = new AudioSample
            {
                FileName = Path.GetFileName(fullPath),
                FilePath = fullPath,
                Extension = Path.GetExtension(fullPath),
                DurationSeconds = reader.TotalTime.TotalSeconds,
                SampleRate = reader.WaveFormat.SampleRate,
                Channels = reader.WaveFormat.Channels
            };

            _db.Samples.Add(sample);
            addedCount++;
        }

        await _db.SaveChangesAsync();

        return addedCount;
    }
}