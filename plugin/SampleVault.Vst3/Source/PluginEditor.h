#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

class SampleVaultAudioProcessorEditor final
    : public juce::AudioProcessorEditor
{
public:
    explicit SampleVaultAudioProcessorEditor(
        SampleVaultAudioProcessor&);

    ~SampleVaultAudioProcessorEditor() override =
        default;

    void paint(
        juce::Graphics&) override;

    void resized() override;

private:
    SampleVaultAudioProcessor& processor;

    juce::Label titleLabel;
    juce::Label statusLabel;
    juce::Label nextLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(
        SampleVaultAudioProcessorEditor)
};
