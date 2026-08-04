// Three.js 3D preview + GLB/USDZ export for AR, built from the same
// triangle list used for the printable STL (potBuilder.buildPotMesh()).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { trianglesToFloat32 } from "./potBuilder.js";

export class PotViewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef0ea);

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x555044, 1.1);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(60, 120, 90);
    this.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-80, 40, -60);
    this.scene.add(dir2);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xb8895f,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.mesh = null;

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._animate();
  }

  _resize() {
    const w = this.container.clientWidth || 300;
    const h = this.container.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateMesh(triangles) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this._lastGeometry) this._lastGeometry.dispose();
    }
    const positions = trianglesToFloat32(triangles);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    // Model space uses Z-up (printer convention); rotate for a natural
    // Y-up view in the 3D viewer / AR without altering the exported STL.
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, this.material);
    group.add(mesh);
    group.rotation.x = -Math.PI / 2;
    this.mesh = group;
    this.scene.add(this.mesh);

    // Fit camera to bounding sphere
    geometry.computeBoundingSphere();
    const s = geometry.boundingSphere;
    const dist = s.radius / Math.sin((Math.PI * this.camera.fov) / 360) * 1.15;
    this.camera.position.set(dist * 0.55, dist * 0.45, dist * 0.7);
    this.camera.near = dist / 100;
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, s.radius * 0.15, 0);
    this.controls.update();

    this._lastGeometry = geometry;
  }

  // glTF/USDZ both assume meters, but the pot geometry (and the on-page
  // preview) is built in millimeters — scale down by 1000x only for the
  // AR export so real-world scale is correct when viewed on a phone.
  // fn must return a Promise — we await it (not just call it) before
  // restoring scale, otherwise an async exporter could read the geometry
  // after the scale's already been put back (race condition).
  async _withMeterScale(fn) {
    const prevScale = this.mesh.scale.clone();
    this.mesh.scale.setScalar(0.001);
    this.mesh.updateMatrixWorld(true);
    try {
      return await fn();
    } finally {
      this.mesh.scale.copy(prevScale);
      this.mesh.updateMatrixWorld(true);
    }
  }

  // Returns an ArrayBuffer (binary GLB), scaled to meters for AR.
  async exportGLB() {
    return this._withMeterScale(
      () =>
        new Promise((resolve, reject) => {
          const exporter = new GLTFExporter();
          exporter.parse(
            this.mesh,
            (result) => resolve(result instanceof ArrayBuffer ? result : new TextEncoder().encode(JSON.stringify(result)).buffer),
            (err) => reject(err),
            { binary: true }
          );
        })
    );
  }

  // Returns a Uint8Array (USDZ, a zip container), scaled to meters for AR.
  async exportUSDZ() {
    return this._withMeterScale(async () => {
      const exporter = new USDZExporter();
      return exporter.parseAsync(this.mesh);
    });
  }
}
