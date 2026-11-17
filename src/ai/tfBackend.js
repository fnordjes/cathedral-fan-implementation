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
  let nativeBroken = false;
  try {
    const m = await import('@tensorflow/tfjs-node');
    const tf = m.sequential ? m : m.default;
    if (tf && tf.sequential) {
      // Importing can succeed while kernels are broken: tfjs-node 4.x calls
      // util.isNullOrUndefined, which Node 23+ removed, so the first real op
      // throws. Run a tiny op to prove the native backend actually works.
      tf.tidy(() => tf.zeros([2, 2]).slice([0, 0], [1, 1]).dataSync());
      if (!process.env.TF_QUIET) console.error('[tf] backend: @tensorflow/tfjs-node (native)');
      return tf;
    }
  } catch (e) {
    // not installed, native binary missing, or incompatible with this Node
    nativeBroken = e?.code !== 'ERR_MODULE_NOT_FOUND';
    if (!process.env.TF_QUIET && nativeBroken) {
      console.error(`[tf] native backend unusable (${e.message}) — falling back to pure JS`);
    }
  }
  const m = await import('@tensorflow/tfjs');
  const tf = m.sequential ? m : m.default;
  // tfjs-node may already have registered and activated its backend on the
  // shared tfjs engine; switch to the pure-JS CPU backend explicitly.
  if (tf.getBackend() !== 'cpu') await tf.setBackend('cpu');
  if (!process.env.TF_QUIET && !nativeBroken) {
    console.error('[tf] backend: @tensorflow/tfjs (pure JS) — install @tensorflow/tfjs-node for a big speedup');
  }
  return tf;
}

const tf = await pick();
export default tf;
