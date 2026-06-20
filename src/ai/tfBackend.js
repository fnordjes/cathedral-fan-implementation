// Selects the TensorFlow.js backend.
//
// If the optional native package `@tensorflow/tfjs-node` is installed (it binds
// to libtensorflow C++ — 10-40x faster training/inference and a `file://` IO
// handler), we use it automatically. Otherwise we fall back to pure-JS
// `@tensorflow/tfjs`, which runs anywhere Node does. The `tf.*` API is identical
// either way, so the rest of the AI code is unchanged.
//
// Set TF_QUIET=1 to silence the one-line backend notice.

async function pick() {
  try {
    const m = await import('@tensorflow/tfjs-node');
    const tf = m.sequential ? m : m.default;
    if (tf && tf.sequential) {
      if (!process.env.TF_QUIET) console.error('[tf] backend: @tensorflow/tfjs-node (native)');
      return tf;
    }
  } catch {
    // not installed, or the native binary is missing -> fall back
  }
  const m = await import('@tensorflow/tfjs');
  const tf = m.sequential ? m : m.default;
  if (!process.env.TF_QUIET) {
    console.error('[tf] backend: @tensorflow/tfjs (pure JS) — install @tensorflow/tfjs-node for a big speedup');
  }
  return tf;
}

const tf = await pick();
export default tf;
