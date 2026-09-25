#include "PluginProcessor.h"
#include "PluginEditor.h"

void SineWaveVoice::startNote(
    int midiNoteNumber,
    float velocity,
    juce::SynthesiserSound*,
    int)
{
    currentAngle = 0.0;
    level = velocity * 0.18f;
    tailOff = 0.0f;

    const auto cyclesPerSecond =
        juce::MidiMessage::getMidiNoteInHertz(
            midiNoteNumber);

    const auto cyclesPerSample =
        cyclesPerSecond /
        getSampleRate();

    angleDelta =
        cyclesPerSample *
        juce::MathConstants<double>::twoPi;
}

void SineWaveVoice::stopNote(
    float,
    bool allowTailOff)
{
    if (allowTailOff)
    {
        if (tailOff == 0.0f)
            tailOff = 1.0f;
    }
    else
    {
        clearCurrentNote();
        angleDelta = 0.0;
    }
}

void SineWaveVoice::renderNextBlock(
    juce::AudioBuffer<float>& outputBuffer,
    int startSample,
    int numSamples)
{
    if (angleDelta == 0.0)
        return;

    while (--numSamples >= 0)
    {
        const auto sample =
            static_cast<float>(
                std::sin(currentAngle)) *
            level *
            (tailOff > 0.0f
                ? tailOff
                : 1.0f);

        for (
            int channel = 0;
            channel <
            outputBuffer.getNumChannels();
            ++channel)
        {
            outputBuffer.addSample(
                channel,
                startSample,
                sample);
        }

        currentAngle += angleDelta;
        ++startSample;

        if (tailOff > 0.0f)
        {
            tailOff *= 0.992f;

            if (tailOff <= 0.005f)
            {
                clearCurrentNote();
                angleDelta = 0.0;
                break;
            }
        }
    }
}

SampleVaultAudioProcessor::
    SampleVaultAudioProcessor()
    : juce::AudioProcessor(
        BusesProperties()
            .withOutput(
                "Output",
                juce::AudioChannelSet::stereo(),
                true))
{
    for (int i = 0; i < 16; ++i)
        synth.addVoice(
            new SineWaveVoice());

    synth.addSound(
        new SineWaveSound());
}

void SampleVaultAudioProcessor::
    prepareToPlay(
        double sampleRate,
        int)
{
    synth.setCurrentPlaybackSampleRate(
        sampleRate);
}

void SampleVaultAudioProcessor::
    releaseResources()
{
}

bool SampleVaultAudioProcessor::
    isBusesLayoutSupported(
        const BusesLayout& layouts) const
{
    const auto& output =
        layouts.getMainOutputChannelSet();

    return
        output ==
            juce::AudioChannelSet::mono() ||
        output ==
            juce::AudioChannelSet::stereo();
}

void SampleVaultAudioProcessor::
    processBlock(
        juce::AudioBuffer<float>& buffer,
        juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    buffer.clear();

    synth.renderNextBlock(
        buffer,
        midiMessages,
        0,
        buffer.getNumSamples());
}

juce::AudioProcessorEditor*
    SampleVaultAudioProcessor::
        createEditor()
{
    return new SampleVaultAudioProcessorEditor(
        *this);
}

void SampleVaultAudioProcessor::
    getStateInformation(
        juce::MemoryBlock&)
{
    // Step 1 has no parameters yet.
}

void SampleVaultAudioProcessor::
    setStateInformation(
        const void*,
        int)
{
    // Step 1 has no parameters yet.
}

juce::AudioProcessor*
    JUCE_CALLTYPE
    createPluginFilter()
{
    return new SampleVaultAudioProcessor();
}
