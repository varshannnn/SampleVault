#include "PluginEditor.h"

SampleVaultAudioProcessorEditor::
    SampleVaultAudioProcessorEditor(
        SampleVaultAudioProcessor& p)
    : juce::AudioProcessorEditor(&p),
      processor(p)
{
    titleLabel.setText(
        "SampleVault",
        juce::dontSendNotification);

    titleLabel.setFont(
        juce::FontOptions(28.0f)
            .withStyle("Bold"));

    titleLabel.setJustificationType(
        juce::Justification::centred);

    addAndMakeVisible(titleLabel);

    statusLabel.setText(
        "VST3 MVP: MIDI IN -> native JUCE synth -> audio OUT",
        juce::dontSendNotification);

    statusLabel.setJustificationType(
        juce::Justification::centred);

    addAndMakeVisible(statusLabel);

    nextLabel.setText(
        "Next: load SampleVault melodic preset JSON + WAV",
        juce::dontSendNotification);

    nextLabel.setJustificationType(
        juce::Justification::centred);

    nextLabel.setColour(
        juce::Label::textColourId,
        juce::Colours::grey);

    addAndMakeVisible(nextLabel);

    setSize(560, 220);
}

void SampleVaultAudioProcessorEditor::
    paint(
        juce::Graphics& g)
{
    g.fillAll(
        juce::Colour::fromRGB(
            23,
            23,
            25));

    g.setColour(
        juce::Colour::fromRGB(
            58,
            58,
            64));

    g.drawRoundedRectangle(
        getLocalBounds()
            .toFloat()
            .reduced(18.0f),
        10.0f,
        1.0f);
}

void SampleVaultAudioProcessorEditor::
    resized()
{
    auto bounds =
        getLocalBounds()
            .reduced(26);

    titleLabel.setBounds(
        bounds.removeFromTop(58));

    bounds.removeFromTop(16);

    statusLabel.setBounds(
        bounds.removeFromTop(32));

    bounds.removeFromTop(8);

    nextLabel.setBounds(
        bounds.removeFromTop(28));
}
