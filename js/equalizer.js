export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  normal: [0,0,0,0,0,0,0,0,0,0],
  pop: [-1,1,2,2,1,0,-1,-1,0,1],
  rock: [3,2,-1,-2,0,2,3,4,3,2],
  classic: [2,1,0,0,0,1,2,3,2,1],
  jazz: [2,1,0,0,1,2,1,0,1,2],
  bass: [6,5,4,2,0,-1,-2,-2,-1,0],
  treble: [-2,-2,-1,0,0,1,3,5,6,7],
  voice: [-1,0,1,2,3,4,2,0,-1,-2],
};

export function createEqualizer(audioEl) {
  let ctx = null;
  let source = null;
  let filters = [];
  let inputGain = null;
  let outputGain = null;
  let enabled = true;

  function build() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    source = ctx.createMediaElementSource(audioEl);
    inputGain = ctx.createGain();
    outputGain = ctx.createGain();
    filters = EQ_FREQS.map((freq) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.2;
      f.gain.value = 0;
      return f;
    });
    source.connect(inputGain);
    let node = inputGain;
    filters.forEach((f) => { node.connect(f); node = f; });
    node.connect(outputGain);
    outputGain.connect(ctx.destination);
    return ctx;
  }

  function setEnabled(flag) {
    enabled = !!flag;
    if (outputGain) outputGain.gain.value = enabled ? 1 : 1;
  }

  function applyBands(bands = []) {
    build();
    filters.forEach((f, i) => { f.gain.value = Number(bands[i] ?? 0); });
  }

  async function resume() {
    if (!build()) return;
    if (ctx.state === 'suspended') await ctx.resume();
  }

  return {
    build,
    resume,
    setEnabled,
    applyBands,
    get context() { return ctx; },
    get filters() { return filters; },
  };
}
