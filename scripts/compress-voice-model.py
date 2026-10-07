"""Makes a smaller copy of the Kokoro speech model that sounds and runs the same.

The model's arithmetic stays in 32-bit floats (the half-precision build on
Hugging Face returns silence for long sentences, and the 8-bit build is too
slow in a browser). Only the way the weights are stored in the file changes:

  w16  weights stored as 16-bit floats, widened by a Cast node when the model loads
  w8   weights stored as 8-bit integers per channel, expanded by DequantizeLinear

The runtime folds those nodes into constants while it loads the model, so
speaking is exactly as fast as with the original file.

Which storage each part gets was measured on four sentences against the
original (mean log-mel distance in dB, lower is closer; sentence length):

  everything w16                    163 MB   0.21 to 0.46   same length
  everything w8                      83 MB   1.7 to 5.6     up to 0.8% shorter
  the mix below                     102 MB   0.27 to 0.52   same length
  official 8-bit build, for scale    92 MB   5.9 to 7.8     three times slower

The sound-making half (decoder), the text encoder and the energy predictor do
not care about 8-bit weights. The language model (bert), the duration and
pitch predictors do, so they keep 16 bits.

Usage:  python scripts/compress-voice-model.py <model.onnx> <out.onnx>
Needs:  pip install onnx numpy
"""
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

MIN_ELEMENTS = 1024  # smaller tensors (biases, norms) stay as they are


def channel_axis(shape):
    """The axis to quantize along: one scale per output channel where there are enough of them."""
    if len(shape) >= 2 and shape[0] >= 8:
        return 0
    if len(shape) >= 2 and shape[1] >= 8:
        return 1
    return None


# Parts whose weights can be stored in 8 bits, by the name of the node that reads them.
EIGHT_BIT = ("/decoder/", "/encoder/text_encoder/cnn", "/encoder/text_encoder/lstm", "/encoder/N.")


def compress(model, mode="mix"):
    """mode: "mix" (the measured recipe), or "w16" / "w8" for every tensor."""
    graph = model.graph
    reader = {}
    for node in graph.node:
        for name in node.input:
            reader.setdefault(name, node.name)
    kept, added, nodes = [], [], []
    for tensor in graph.initializer:
        size = int(np.prod(tensor.dims)) if tensor.dims else 1
        if tensor.data_type != TensorProto.FLOAT or size < MIN_ELEMENTS:
            kept.append(tensor)
            continue
        values = numpy_helper.to_array(tensor).astype(np.float32)
        name = tensor.name
        storage = mode if mode != "mix" else ("w8" if reader.get(name, name).startswith(EIGHT_BIT) else "w16")
        if storage == "w16":
            half = values.astype(np.float16)
            if not np.all(np.isfinite(half)):
                kept.append(tensor)
                continue
            added.append(numpy_helper.from_array(half, name + "__w16"))
            nodes.append(helper.make_node("Cast", [name + "__w16"], [name], to=TensorProto.FLOAT, name=name + "__widen"))
            continue
        axis = channel_axis(values.shape)
        if axis is None:
            low, high = float(values.min()), float(values.max())
            low, high = min(low, 0.0), max(high, 0.0)  # zero must be exact
            scale = np.float32((high - low) / 255.0) or np.float32(1.0)
            zero = np.uint8(np.clip(np.round(-low / scale), 0, 255))
            q = np.clip(np.round(values / scale) + zero, 0, 255).astype(np.uint8)
            scale_arr, zero_arr = np.array(scale, dtype=np.float32), np.array(zero, dtype=np.uint8)
            attrs = {}
        else:
            other = tuple(i for i in range(values.ndim) if i != axis)
            low = np.minimum(values.min(axis=other), 0.0)
            high = np.maximum(values.max(axis=other), 0.0)
            scale_arr = ((high - low) / 255.0).astype(np.float32)
            scale_arr[scale_arr == 0] = 1.0
            zero_arr = np.clip(np.round(-low / scale_arr), 0, 255).astype(np.uint8)
            view = [1] * values.ndim
            view[axis] = -1
            q = np.clip(np.round(values / scale_arr.reshape(view)) + zero_arr.reshape(view), 0, 255).astype(np.uint8)
            attrs = {"axis": axis}
        added += [numpy_helper.from_array(q, name + "__q"), numpy_helper.from_array(scale_arr, name + "__s"), numpy_helper.from_array(zero_arr, name + "__z")]
        nodes.append(helper.make_node("DequantizeLinear", [name + "__q", name + "__s", name + "__z"], [name], name=name + "__expand", **attrs))

    del graph.initializer[:]
    graph.initializer.extend(kept + added)
    rest = list(graph.node)
    del graph.node[:]
    graph.node.extend(nodes + rest)  # the new nodes feed the old ones, so they come first
    return len(nodes)


def main():
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    mode = sys.argv[3] if len(sys.argv) > 3 else "mix"
    target.parent.mkdir(parents=True, exist_ok=True)
    model = onnx.load(str(source))
    changed = compress(model, mode)
    onnx.checker.check_model(model)
    onnx.save(model, str(target))
    print(f"{target}: {target.stat().st_size / 1e6:.1f} MB, {target.stat().st_size / 2**20:.1f} MiB "
          f"({changed} weight tensors compressed; original {source.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
