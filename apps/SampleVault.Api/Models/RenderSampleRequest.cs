namespace SampleVault.Api.Models;

public class RenderSampleRequest
{
    public double StartTime { get; set; }

    public double EndTime { get; set; }

    public bool Reverse { get; set; }
}