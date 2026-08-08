import * as THREE from "three";
import { BLOCKS, blockForItem, tileUv } from "./blocks";
import { ItemId } from "./types";

type SwingKind = "mine" | "attack" | "place" | "use";

function paintBoxUv(geometry: THREE.BufferGeometry, item: ItemId): void {
  const id = blockForItem(item);
  if (id === null) return;
  const uv = tileUv(id);
  const attribute = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < attribute.count; index += 1) {
    const x = attribute.getX(index);
    const y = attribute.getY(index);
    attribute.setXY(index, uv.u0 + x * (uv.u1 - uv.u0), uv.v0 + y * (uv.v1 - uv.v0));
  }
  attribute.needsUpdate = true;
}

function basicMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false, transparent: true });
}

function box(
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), basicMaterial(color));
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.renderOrder = 1000;
  return mesh;
}

function toolModel(item: ItemId): THREE.Group {
  const group = new THREE.Group();
  const handle = 0x9b613c;
  if (item.includes("pick")) {
    const head = item === "tool:crystal-pick" ? 0x74f5e5
      : item === "tool:diamond-pick" ? 0x62d9d3
        : item === "tool:iron-pick" ? 0xd1d9d7
          : item === "tool:copper-pick" ? 0xda8758
            : item === "tool:wood-pick" ? 0xb77948
              : 0x9ea7a7;
    group.add(
      box([0.06, 0.55, 0.06], [0, -0.05, 0], handle, [0, 0, -0.5]),
      box([0.44, 0.09, 0.08], [-0.12, 0.19, 0], head, [0, 0, -0.28]),
    );
  } else if (item === "tool:hatchet" || item === "tool:wood-hatchet") {
    const head = item === "tool:wood-hatchet" ? 0xb77948 : 0xaeb6b5;
    group.add(box([0.07, 0.52, 0.07], [0, -0.05, 0], handle, [0, 0, -0.28]), box([0.28, 0.22, 0.08], [-0.1, 0.17, 0], head, [0, 0, -0.18]));
  } else if (item === "tool:spade" || item === "tool:wood-spade") {
    const head = item === "tool:wood-spade" ? 0xb77948 : 0xabb5b5;
    group.add(box([0.06, 0.48, 0.06], [0, 0, 0], handle), box([0.24, 0.22, 0.07], [0, -0.31, 0], head, [0, 0, Math.PI / 4]));
  } else if (item === "tool:wood-club") {
    group.add(box([0.14, 0.62, 0.14], [0, 0.02, 0], 0x9b613c, [0, 0, -0.3]), box([0.21, 0.28, 0.19], [-0.08, 0.24, 0], 0xb77948, [0, 0, -0.3]));
  } else if (["tool:blade", "tool:copper-saber"].includes(item)) {
    const blade = item === "tool:copper-saber" ? 0xee9c68 : 0xc7d0d0;
    group.add(box([0.075, 0.58, 0.045], [0, 0.12, 0], blade, [0, 0, -0.16]), box([0.29, 0.07, 0.08], [-0.04, -0.18, 0], 0xd69a5b), box([0.09, 0.2, 0.09], [0, -0.3, 0], handle));
  } else if (item === "tool:stone-spear") {
    group.add(box([0.055, 0.72, 0.055], [0, -0.05, 0], handle, [0, 0, -0.22]), box([0.16, 0.28, 0.07], [-0.08, 0.34, 0], 0xaeb7b5, [0, 0, -0.22]));
  } else if (item === "tool:aether-repeater") {
    group.add(
      box([0.48, 0.14, 0.16], [0, 0.05, 0], 0x536d7b, [0, 0, -0.06]),
      box([0.11, 0.3, 0.11], [0.08, -0.16, 0], handle, [0, 0, 0.18]),
      box([0.11, 0.11, 0.22], [-0.13, 0.06, 0], 0x7dfff0),
    );
  } else {
    const color = item.startsWith("food:") ? 0xe88bb4 : item.startsWith("consumable:") ? 0x6ed3c6 : item.startsWith("ammo:") ? 0x91fff0 : 0xd18b5b;
    group.add(box([0.25, 0.25, 0.12], [0, 0, 0], color, [0.2, 0.25, 0.16]));
  }
  return group;
}

export class FirstPersonViewModel {
  readonly root = new THREE.Group();
  private readonly itemRoot = new THREE.Group();
  private item: ItemId | null = null;
  private swingTime = 0;
  private swingKind: SwingKind = "mine";
  private walkTime = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly atlas: THREE.CanvasTexture) {
    this.root.position.set(0.38, -0.38, -0.72);
    const sleeve = box([0.19, 0.38, 0.2], [0.11, -0.09, 0.03], 0x315f65, [-0.1, 0, -0.24]);
    const hand = box([0.18, 0.24, 0.18], [0.03, 0.17, 0], 0xc98b68, [-0.1, 0, -0.24]);
    this.itemRoot.position.set(-0.06, 0.19, -0.04);
    this.itemRoot.rotation.set(0.12, -0.2, -0.5);
    this.root.add(sleeve, hand, this.itemRoot);
    this.camera.add(this.root);
  }

  setItem(item: ItemId | null): void {
    if (this.item === item) return;
    this.item = item;
    while (this.itemRoot.children.length > 0) {
      const child = this.itemRoot.children[0];
      if (child) {
        this.itemRoot.remove(child);
        child.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) material.dispose();
          }
        });
      }
    }
    if (!item) return;
    const blockId = blockForItem(item);
    if (blockId !== null) {
      const shape = BLOCKS[blockId].shape ?? "cube";
      const geometry: THREE.BufferGeometry = shape === "cross"
        ? new THREE.PlaneGeometry(0.34, 0.42)
        : shape === "wire" || shape === "plate"
          ? new THREE.BoxGeometry(0.34, 0.055, 0.34)
          : shape === "torch" || shape === "rod" || shape === "ladder"
            ? new THREE.BoxGeometry(0.09, 0.42, 0.09)
            : shape === "slab"
              ? new THREE.BoxGeometry(0.32, 0.16, 0.32)
              : shape === "bed"
                ? new THREE.BoxGeometry(0.34, 0.14, 0.28)
            : shape === "portal" || shape === "door" || shape === "pane"
                  ? new THREE.BoxGeometry(0.26, 0.4, 0.06)
                  : shape === "fence"
                    ? new THREE.BoxGeometry(0.12, 0.4, 0.12)
              : shape === "hopper"
                ? new THREE.CylinderGeometry(0.1, 0.2, 0.31, 4)
                : shape === "piston"
                  ? new THREE.BoxGeometry(0.36, 0.27, 0.28)
                  : new THREE.BoxGeometry(0.28, 0.28, 0.28);
      paintBoxUv(geometry, item);
      const material = new THREE.MeshBasicMaterial({
        map: this.atlas,
        color: 0xffffff,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        transparent: true,
        opacity: BLOCKS[blockId].opaque ? 1 : 0.82,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.set(0.25, 0.62, 0.1);
      mesh.renderOrder = 1000;
      this.itemRoot.add(mesh);
    } else this.itemRoot.add(toolModel(item));
  }

  swing(kind: SwingKind): void {
    if (this.swingTime > 0.16 && kind === "mine") return;
    this.swingKind = kind;
    this.swingTime = kind === "attack" ? 0.34 : kind === "place" ? 0.24 : 0.3;
  }

  update(dt: number, speed: number): void {
    this.walkTime += dt * (2.5 + speed * 1.5);
    this.swingTime = Math.max(0, this.swingTime - dt);
    const duration = this.swingKind === "attack" ? 0.34 : this.swingKind === "place" ? 0.24 : 0.3;
    const progress = this.swingTime > 0 ? 1 - this.swingTime / duration : 0;
    const arc = this.swingTime > 0 ? Math.sin(progress * Math.PI) : 0;
    const bob = Math.min(1, speed / 4.5);
    this.root.position.set(
      0.38 + Math.sin(this.walkTime) * 0.012 * bob - arc * (this.swingKind === "attack" ? 0.2 : 0.15),
      -0.38 + Math.abs(Math.cos(this.walkTime)) * 0.014 * bob - arc * (this.swingKind === "attack" ? 0.25 : 0.18),
      -0.72 + arc * 0.2,
    );
    this.root.rotation.set(
      arc * (this.swingKind === "mine" ? -0.92 : -0.52),
      arc * (this.swingKind === "attack" ? -1.08 : -0.58),
      arc * (this.swingKind === "place" ? 0.42 : -0.72),
    );
  }

  dispose(): void {
    this.camera.remove(this.root);
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
  }
}
