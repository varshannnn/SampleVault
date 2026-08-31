namespace SampleVault.Api.Models;

public class AudioSample
{
    public int Id { get; set; }

    public string FileName { get; set; } = string.Empty;

    public string FilePath { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    public string Extension { get; set; } = string.Empty;

    public double DurationSeconds { get; set; }

    public int SampleRate { get; set; }

    public int Channels { get; set; }

    public bool IsFavorite { get; set; }

    public DateTime IndexedAt { get; set; } = DateTime.UtcNow;
}