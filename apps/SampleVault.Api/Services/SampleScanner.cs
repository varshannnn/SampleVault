using Microsoft.EntityFrameworkCore;
using NAudio.Wave;
using SampleVault.Api.Data;
using SampleVault.Api.Models;

namespace SampleVault.Api.Services;

public class SampleScanner
{
    private readonly SampleVaultDbContext _db;
    private readonly AutoTagger _autoTagger;

    public SampleScanner(
        SampleVaultDbContext db,
        AutoTagger autoTagger)
    {
        _db = db;
        _autoTagger = autoTagger;
    }

    public async Task<ScanResult> ScanFolderAsync(
        string folderPath)
    {
        if (!Directory.Exists(folderPath))
        {
            throw new DirectoryNotFoundException(
                $"Folder does not exist: {folderPath}");
        }

        var existingPaths = new HashSet<string>(
            await _db.Samples
                .Select(sample => sample.FilePath)
                .ToListAsync(),
            StringComparer.OrdinalIgnoreCase);

        var existingTags = await _db.Tags
            .ToDictionaryAsync(
                tag => tag.Name,
                StringComparer.OrdinalIgnoreCase);

        string[] files = Directory.GetFiles(
            folderPath,
            "*.wav",
            SearchOption.AllDirectories);

        int addedCount = 0;
        int autoTaggedCount = 0;

        var needsReviewSamples =
            new List<AudioSample>();

        foreach (string filePath in files)
        {
            string fullPath =
                Path.GetFullPath(filePath);

            string relativePath =
                Path.GetRelativePath(
                    folderPath,
                    fullPath);

            string category =
                Directory.GetParent(fullPath)?.Name
                ?? "Uncategorized";

            if (existingPaths.Contains(fullPath))
            {
                continue;
            }

            try
            {
                using var reader =
                    new AudioFileReader(fullPath);

                var sample = new AudioSample
                {
                    FileName =
                        Path.GetFileName(fullPath),

                    FilePath = fullPath,

                    RelativePath = relativePath,

                    Category = category,

                    Extension =
                        Path.GetExtension(fullPath),

                    DurationSeconds =
                        reader.TotalTime.TotalSeconds,

                    SampleRate =
                        reader.WaveFormat.SampleRate,

                    Channels =
                        reader.WaveFormat.Channels
                };

                HashSet<string> tagNames =
                    _autoTagger.GetTags(
                        relativePath,
                        sample.FileName);

                bool needsReview =
                    tagNames.Count == 1 &&
                    tagNames.Contains("Other");

                if (needsReview)
                {
                    needsReviewSamples.Add(sample);
                }
                else
                {
                    autoTaggedCount++;
                }

                foreach (string tagName in tagNames)
                {
                    if (!existingTags.TryGetValue(
                        tagName,
                        out Tag? tag))
                    {
                        tag = new Tag
                        {
                            Name = tagName
                        };

                        _db.Tags.Add(tag);

                        existingTags[tagName] = tag;
                    }

                    sample.Tags.Add(tag);
                }

                _db.Samples.Add(sample);

                existingPaths.Add(fullPath);

                addedCount++;
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    $"Failed to scan '{fullPath}': {ex.Message}");
            }
        }

        await _db.SaveChangesAsync();

        return new ScanResult
        {
            Added = addedCount,

            AutoTagged = autoTaggedCount,

            NeedsReview =
                needsReviewSamples.Count,

            ReviewSampleIds =
                needsReviewSamples
                    .Select(sample => sample.Id)
                    .ToList()
        };
    }
}