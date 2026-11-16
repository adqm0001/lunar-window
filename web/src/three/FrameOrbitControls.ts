import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Input handlers accumulate rotation, pan and zoom. Apply them once per animation frame,
// so a burst of touch events cannot advance damping repeatedly before the next render.
export class FrameOrbitControls extends OrbitControls {
  private frameDriven = true;

  override update(deltaTime?: number | null): boolean {
    // The base constructor calls update before this field is initialized.
    return this.frameDriven ? false : super.update(deltaTime);
  }

  updateFrame(deltaTime?: number): boolean {
    const damping = this.dampingFactor;
    // Keep the same decay per second at 30, 60 or 120 Hz. Long pauses are capped,
    // like camera flights, rather than consuming all remaining movement at once.
    if (deltaTime !== undefined) this.dampingFactor = 1 - (1 - damping) ** (Math.min(0.25, Math.max(0, deltaTime)) * 60);
    try {
      return super.update(deltaTime);
    } finally {
      this.dampingFactor = damping;
    }
  }
}
