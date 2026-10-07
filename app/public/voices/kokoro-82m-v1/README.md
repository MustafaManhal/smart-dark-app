# Speech model for the natural voices

`resolve/main/onnx/model.onnx` is the Kokoro-82M text-to-speech model (version 1.0), in the ONNX export with
word timings published at https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped. Kokoro is by
hexgrad (https://huggingface.co/hexgrad/Kokoro-82M) and is licensed under the Apache License 2.0; see `LICENSE`.

Changes made for Reader343 (2026-10-07): the weights are stored more compactly, so the file is 102 MB instead of
326 MB. The sound-making half, the text encoder and the energy predictor store 8-bit weights; the rest stores
16-bit weights. The model expands them to 32-bit floats when it loads and computes exactly as the original does.
Nothing else in the model was changed. `scripts/compress-voice-model.py` in this repository makes the file from
the original and records the measurements behind the choice.

`config.json`, `tokenizer.json` and `tokenizer_config.json` are unchanged copies from the same export. The folder
layout (`resolve/main/`) is the one transformers.js asks a model host for.
