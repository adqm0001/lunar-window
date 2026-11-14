import * as THREE from "three";

// A small lander at true scale (units are km, so 1 m = 0.001): an eight-sided body on four
// legs with a solar panel on a mast. Lit by its own light that follows the real Sun.

const M = 0.001;

export class LanderModel {
  group = new THREE.Group();
  lights = new THREE.Group();
  private panelPivot = new THREE.Group();
  private sunLight = new THREE.DirectionalLight(0xfff4e6, 3.2);
  private ambient = new THREE.AmbientLight(0x8899bb, 0.06);

  constructor() {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25 * M, 1.4 * M, 1.6 * M, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.6, roughness: 0.45 }),
    );
    body.position.y = 2.0 * M;
    const foil = new THREE.Mesh(
      new THREE.CylinderGeometry(1.42 * M, 1.42 * M, 0.5 * M, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 }),
    );
    foil.position.y = 1.35 * M;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.7, roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = new THREE.Vector3(Math.cos(a) * 2.3 * M, 0.08 * M, Math.sin(a) * 2.3 * M);
      const top = new THREE.Vector3(Math.cos(a) * 1.1 * M, 1.6 * M, Math.sin(a) * 1.1 * M);
      const len = foot.distanceTo(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * M, 0.06 * M, len, 6), legMat);
      leg.position.copy(foot).add(top).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * M, 0.32 * M, 0.08 * M, 12), legMat);
      pad.position.copy(foot);
      this.group.add(leg, pad);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * M, 0.07 * M, 1.6 * M, 6), legMat);
    mast.position.y = 3.6 * M;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(3.0 * M, 1.8 * M, 0.06 * M),
      new THREE.MeshStandardMaterial({ color: 0x1b2a55, metalness: 0.4, roughness: 0.25, emissive: 0x050a1a }),
    );
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(3.08 * M, 1.88 * M, 0.04 * M),
      new THREE.MeshStandardMaterial({ color: 0xb0b4ba, metalness: 0.8, roughness: 0.4 }),
    );
    frame.position.z = -0.03 * M;
    this.panelPivot.position.y = 4.4 * M;
    this.panelPivot.add(panel, frame);
    const antenna = new THREE.Mesh(
      new THREE.SphereGeometry(0.45 * M, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }),
    );
    antenna.position.set(0.9 * M, 2.9 * M, 0);
    antenna.rotation.z = -0.9;
    this.group.add(body, foil, mast, this.panelPivot, antenna);
    this.lights.add(this.sunLight, this.sunLight.target, this.ambient);
    this.group.visible = false;
    this.lights.visible = false;
  }

  // Place on the ground at `pos` with local `up`; `north` is the local north direction (world)
  place(pos: THREE.Vector3, up: THREE.Vector3, north: THREE.Vector3) {
    const z = north.clone().sub(up.clone().multiplyScalar(north.dot(up))).normalize();
    const x = up.clone().cross(z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, up, z);
    this.group.position.copy(pos);
    this.group.quaternion.setFromRotationMatrix(m);
  }

  // Panel faces azimuth `azDeg` (0 = north, 90 = east), standing vertical, or lies flat
  setPanel(mode: string, azDeg: number) {
    const a = (azDeg * Math.PI) / 180;
    if (mode === "horizontal") {
      this.panelPivot.rotation.set(-Math.PI / 2, 0, 0);
      return;
    }
    // local frame: +z = north, +x = west (up x north), so east is -x
    this.panelPivot.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
  }

  setVisible(on: boolean) {
    this.group.visible = on;
    this.lights.visible = on;
  }

  setSun(dirWorld: THREE.Vector3) {
    this.sunLight.position.copy(this.group.position).addScaledVector(dirWorld, 0.05);
    this.sunLight.target.position.copy(this.group.position);
    this.sunLight.target.updateMatrixWorld();
  }
}
