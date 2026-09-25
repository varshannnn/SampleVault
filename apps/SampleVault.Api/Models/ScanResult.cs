namespace SampleVault.Api.Models;

public class ScanResult
{
    public int Added { get; set; }

    public int AutoTagged { get; set; }

    public int NeedsReview { get; set; }

    public List<int> ReviewSampleIds { get; set; } = [];
}