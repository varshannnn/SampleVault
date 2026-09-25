using System.Text.RegularExpressions;

namespace SampleVault.Api.Services;

public class AutoTagger
{
    public HashSet<string> GetTags(
        string relativePath,
        string fileName)
    {
        var tags = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase);

        string text = Normalize(
            $"{relativePath} {fileName}");

        // 808
        if (ContainsWord(text, "808") ||
            ContainsWord(text, "808s"))
        {
            tags.Add("808");
        }

        // Kick
        if (ContainsWord(text, "kick") ||
            ContainsWord(text, "kicks"))
        {
            tags.Add("Kick");
        }

        // Snare
        if (ContainsWord(text, "snare") ||
            ContainsWord(text, "snares"))
        {
            tags.Add("Snare");
        }

        // Clap
        if (ContainsWord(text, "clap") ||
            ContainsWord(text, "claps"))
        {
            tags.Add("Clap");
        }

        // Closed / hi hats
        if (ContainsWord(text, "hh") ||
            text.Contains("hi hat") ||
            text.Contains("hi hats") ||
            ContainsWord(text, "hihat") ||
            ContainsWord(text, "hihats") ||
            text.Contains("closed hat") ||
            text.Contains("closed hats"))
        {
            tags.Add("Hi Hat");
        }

        // Open hats
        if (ContainsWord(text, "oh") ||
            text.Contains("open hat") ||
            text.Contains("open hats"))
        {
            tags.Add("Open Hat");
        }

        // Percussion
        if (ContainsWord(text, "perc") ||
            ContainsWord(text, "percs") ||
            ContainsWord(text, "percussion"))
        {
            tags.Add("Percussion");
        }

        // FX
        if (ContainsWord(text, "fx") ||
            ContainsWord(text, "sfx") ||
            ContainsWord(text, "effect") ||
            ContainsWord(text, "effects"))
        {
            tags.Add("FX");
        }

        // Vocals
        if (ContainsWord(text, "vox") ||
            ContainsWord(text, "vocal") ||
            ContainsWord(text, "vocals") ||
            ContainsWord(text, "acapella") ||
            ContainsWord(text, "acapellas"))
        {
            tags.Add("Vocal");
        }

        // Bass
        if (ContainsWord(text, "bass") ||
            ContainsWord(text, "basses"))
        {
            tags.Add("Bass");
        }

        // Melodic
        if (ContainsWord(text, "melody") ||
            ContainsWord(text, "melodies") ||
            ContainsWord(text, "chord") ||
            ContainsWord(text, "chords"))
        {
            tags.Add("Melodic");
        }

        // Loops
        if (ContainsWord(text, "loop") ||
            ContainsWord(text, "loops"))
        {
            tags.Add("Loop");
        }

        // Explicit one-shot naming
        if (text.Contains("one shot") ||
            text.Contains("one shots") ||
            ContainsWord(text, "oneshot") ||
            ContainsWord(text, "oneshots"))
        {
            tags.Add("One Shot");
        }

        // Cymbals
        if (ContainsWord(text, "cymbal") ||
            ContainsWord(text, "cymbals") ||
            ContainsWord(text, "crash") ||
            ContainsWord(text, "crashes"))
        {
            tags.Add("Cymbal");
        }

        if (tags.Count == 0)
        {
            tags.Add("Other");
        }
        
        return tags;
    }

    private static string Normalize(string value)
    {
        string normalized = value
            .ToLowerInvariant()
            .Replace('\\', ' ')
            .Replace('/', ' ');

        // Turns things like "808s (42)" into "808s"
        normalized = Regex.Replace(
            normalized,
            @"\(\d+\)",
            " ");

        // Treat common separators as spaces.
        normalized = Regex.Replace(
            normalized,
            @"[_\-]+",
            " ");

        // Collapse repeated whitespace.
        normalized = Regex.Replace(
            normalized,
            @"\s+",
            " ");

        return normalized.Trim();
    }

    private static bool ContainsWord(
        string text,
        string word)
    {
        return Regex.IsMatch(
            text,
            $@"\b{Regex.Escape(word)}\b",
            RegexOptions.IgnoreCase);
    }
}