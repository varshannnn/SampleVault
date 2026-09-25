using System.Runtime.InteropServices;

namespace SampleVault.Api.Infrastructure;

/// <summary>
/// Centralizes the on-disk locations shared by the desktop app
/// and the future native VST3.
///
/// The important design rule is that the plugin must NEVER depend
/// on localhost HTTP or the ASP.NET process for real-time playback.
/// It should be able to resolve preset JSON + audio files directly.
/// </summary>
public sealed class SampleVaultStoragePaths
{
    public string Root { get; }
    public string PresetsRoot { get; }
    public string DrumRackPresets { get; }
    public string MelodicPresets { get; }
    public string AssetsRoot { get; }

    public SampleVaultStoragePaths()
    {
        var localAppData =
            Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData);

        Root = Path.Combine(
            localAppData,
            "SampleVault");

        PresetsRoot = Path.Combine(
            Root,
            "Presets");

        DrumRackPresets = Path.Combine(
            PresetsRoot,
            "DrumRacks");

        MelodicPresets = Path.Combine(
            PresetsRoot,
            "Melodic");

        AssetsRoot = Path.Combine(
            Root,
            "Assets");

        EnsureDirectories();
    }

    public void EnsureDirectories()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(PresetsRoot);
        Directory.CreateDirectory(DrumRackPresets);
        Directory.CreateDirectory(MelodicPresets);
        Directory.CreateDirectory(AssetsRoot);
    }
}
