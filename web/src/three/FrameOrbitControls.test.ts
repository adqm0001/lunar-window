import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { FrameOrbitControls } from "./FrameOrbitControls";

// OrbitControls only needs these input-surface methods; no browser, DOM or WebGL is started.
class InputSurface extends EventTarget {
  style = { touchAction: "" };
  clientWidth = 390;
  clientHeight = 844;
  private root = new EventTarget();
  getRootNode() { return this.root; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function setup() {
  const surface = new InputSurface();
  const camera = new PerspectiveCamera(42, surface.clientWidth / surface.clientHeight, 0.02, 20000);
  camera.position.set(0, 5, 10);
  const controls = new FrameOrbitControls(camera, surface as unknown as HTMLElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.updateFrame();
  return { surface, camera, controls };
}

function pointer(surface: InputSurface, type: string, x: number, id = 1, y = 400, pointerType = "touch") {
  const event = new Event(type);
  Object.assign(event, { pointerId: id, pointerType, button: 0, buttons: type === "pointerup" ? 0 : 1, pageX: x, pageY: y, clientX: x, clientY: y, ctrlKey: false, metaKey: false, shiftKey: false });
  surface.dispatchEvent(event);
}

function drag(moves: number) {
  const state = setup();
  pointer(state.surface, "pointerdown", 100);
  for (let i = 1; i <= moves; i++) pointer(state.surface, "pointermove", 100 + 200 * i / moves);
  return state;
}

describe("camera input frame pacing", () => {
  it("does not move the camera between animation frames during a fast touch drag", () => {
    const { surface, camera, controls } = setup();
    const before = camera.position.clone();
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-10);
    controls.dispose();
  });

  it("gives the same rendered position for a drag delivered in one event or a burst", () => {
    const single = drag(1);
    const burst = drag(20);
    single.controls.updateFrame(1 / 60);
    burst.controls.updateFrame(1 / 60);
    expect(single.camera.position.distanceTo(burst.camera.position)).toBeLessThan(1e-10);
    expect(single.camera.position.distanceTo(new Vector3(0, 5, 10))).toBeGreaterThan(0.01);
    single.controls.dispose();
    burst.controls.dispose();
  });

  it("settles the same movement over equal elapsed time at 30, 60 and 120 Hz", () => {
    const positions = [30, 60, 120].map((fps) => {
      const { surface, camera, controls } = drag(20);
      pointer(surface, "pointerup", 300);
      for (let frame = 0; frame < fps; frame++) controls.updateFrame(1 / fps);
      expect(controls.dampingFactor).toBe(0.07);
      controls.dispose();
      return camera.position;
    });
    expect(positions[0].distanceTo(positions[1])).toBeLessThan(1e-10);
    expect(positions[1].distanceTo(positions[2])).toBeLessThan(1e-10);
  });

  it("retains two-finger pinch zoom and pan when applying a queued frame", () => {
    const { surface, camera, controls } = setup();
    const before = camera.position.clone();
    const distance = controls.getDistance();
    pointer(surface, "pointerdown", 120, 1);
    pointer(surface, "pointerdown", 220, 2);
    pointer(surface, "pointermove", 320, 2);
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-10);
    controls.updateFrame(1 / 60);
    expect(controls.getDistance()).toBeCloseTo(distance / 2, 10);
    expect(controls.target.length()).toBeGreaterThan(0);
    controls.dispose();
  });

  it("starts a fresh gesture after pointer cancellation", () => {
    const { surface, controls } = setup();
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointercancel", 100);
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 120);
    controls.updateFrame(1 / 60);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(-2 * Math.PI * 20 / surface.clientHeight * 0.07, 10);
    controls.dispose();
  });

  it("retains mouse dragging and wheel zoom", () => {
    const { surface, camera, controls } = setup();
    const before = camera.position.clone();
    pointer(surface, "pointerdown", 100, 1, 400, "mouse");
    pointer(surface, "pointermove", 150, 1, 400, "mouse");
    pointer(surface, "pointerup", 150, 1, 400, "mouse");
    controls.updateFrame(1 / 60);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0.01);
    const distance = controls.getDistance();
    const wheel = new Event("wheel", { cancelable: true });
    Object.assign(wheel, { clientX: 200, clientY: 400, deltaMode: 0, deltaY: -100, ctrlKey: false });
    surface.dispatchEvent(wheel);
    expect(controls.getDistance()).toBeCloseTo(distance, 10);
    controls.updateFrame(1 / 60);
    expect(controls.getDistance()).toBeLessThan(distance);
    controls.dispose();
  });

  it("updates each split-view camera independently and removes input listeners on dispose", () => {
    const left = drag(20);
    const right = setup();
    const rightBefore = right.camera.position.clone();
    left.controls.updateFrame(1 / 60);
    right.controls.updateFrame(1 / 60);
    expect(right.camera.position.distanceTo(rightBefore)).toBeLessThan(1e-10);
    right.controls.dispose();
    pointer(right.surface, "pointerdown", 100);
    pointer(right.surface, "pointermove", 300);
    right.controls.updateFrame(1 / 60);
    expect(right.camera.position.distanceTo(rightBefore)).toBeLessThan(1e-10);
    left.controls.dispose();
  });
});
