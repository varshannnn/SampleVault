cmake_minimum_required(VERSION 3.22)

project(
    SampleVaultPlugin
    VERSION 0.1.0
    LANGUAGES C CXX
)

include(FetchContent)

FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 9.0.2
    GIT_SHALLOW TRUE
)

FetchContent_MakeAvailable(JUCE)

juce_add_plugin(
    SampleVault

    COMPANY_NAME "SampleVault"
    BUNDLE_ID "com.samplevault.plugin"

    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE

    EDITOR_WANTS_KEYBOARD_FOCUS FALSE

    COPY_PLUGIN_AFTER_BUILD FALSE

    PLUGIN_MANUFACTURER_CODE SVLT
    PLUGIN_CODE SVP1

    FORMATS
        VST3
        Standalone

    PRODUCT_NAME "SampleVault"
)

# Generates JuceHeader.h for our source files.
juce_generate_juce_header(
    SampleVault
)

target_sources(
    SampleVault
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
        Source/PluginEditor.cpp
        Source/PluginEditor.h
)

target_compile_features(
    SampleVault
    PRIVATE
        cxx_std_20
)

target_compile_definitions(
    SampleVault
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(
    SampleVault

    PRIVATE
        juce::juce_audio_utils

    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)