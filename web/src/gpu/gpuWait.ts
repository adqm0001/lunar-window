/**
 * Resolves once the GPU has finished everything submitted on `gl` so far, without blocking the main thread: a fence
 * is polled with a zero timeout between timer ticks. Long GPU jobs submit a band, await this, then the next band, so
 * the page keeps drawing and taking input in between; a readPixels after the last band then returns at once instead
 * of stalling until the whole job is done.
 */
export function gpuIdle(gl: WebGL2RenderingContext): Promise<void> {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  if (!sync) return Promise.resolve();
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) {
        setTimeout(poll, 2);
        return;
      }
      gl.deleteSync(sync);
      resolve();
    };
    poll();
  });
}
