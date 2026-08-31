using Microsoft.AspNetCore.Mvc;

namespace SampleVault.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SamplesController : ControllerBase
{
    [HttpGet]
    public IActionResult GetSamples()
    {
        return Ok(new
        {
            message = "SampleVault API is working"
        });
    }
}