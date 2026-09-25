namespace SampleVault.Api.Models;

public class DrumRackPresetSlot
{
    public int Id { get; set; }

    public int DrumRackPresetId
    {
        get;
        set;
    }

    public DrumRackPreset? DrumRackPreset
    {
        get;
        set;
    }

    public int SlotIndex { get; set; }

    /*
      "library"   -> AudioSampleId points to
                     a normal SampleVault sample.

      "rackAsset" -> FilePath points to a stable
                     private WAV owned by this preset.
    */
    public string SourceKind { get; set; } =
        string.Empty;

    public int? AudioSampleId { get; set; }

    public AudioSample? AudioSample
    {
        get;
        set;
    }

    public string FileName { get; set; } =
        string.Empty;

    public string FilePath { get; set; } =
        string.Empty;

    public double DurationSeconds
    {
        get;
        set;
    }

    /*
      Keep rack display metadata without making
      another many-to-many tag relationship.
    */
    public string TagsJson { get; set; } =
        "[]";
}
