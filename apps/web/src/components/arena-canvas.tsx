"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ArenaConfig, SlotMarker } from "@bodytag/shared";
import type { PublicCampaign } from "@/lib/campaigns";
import { publicFileUrl } from "@/lib/public-url";
import {
  applyBaseKitMaterial,
  bakeSkinnedMeshes,
  baseKitClassifier,
  describeBody,
  hasOutfit,
  makeDecalGeometry,
  projectSlot,
  relaxArms,
  slotPlaceholderTexture,
  type ArenaBody,
} from "@/lib/arena-body";

type Theme = { bg: string; fog: string; fill: string; grid: [string, string]; accent: string; env: number };

const THEMES: Record<ArenaConfig["theme"], Theme> = {
  grid: { bg: "#070707", fog: "#070707", fill: "#1a1a1a", grid: ["#e8641c", "#2a2a2a"], accent: "#e8641c", env: 0.55 },
  ares: { bg: "#140807", fog: "#1a0505", fill: "#1c0c0a", grid: ["#e8641c", "#2a2a2a"], accent: "#e8641c", env: 0.5 },
  studio: { bg: "#d7cbb8", fog: "#c8b8a2", fill: "#eee4d4", grid: ["#e8641c", "#b8aa96"], accent: "#e8641c", env: 0.9 },
  // Dark navy + cyan wireframe floor, the "sponsor my body" tunnel look.
  neon: { bg: "#050a14", fog: "#050a14", fill: "#0a1222", grid: ["#22d3ee", "#12304a"], accent: "#22d3ee", env: 0.7 },
  none: { bg: "#000000", fog: "#000000", fill: "#111111", grid: ["#e8641c", "#2a2a2a"], accent: "#e8641c", env: 0.55 },
};

/** Start directions; the distance is derived from the body height once it is known. */
const CAMERA_DIRS: Record<ArenaConfig["startCamera"], THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.12, 1),
  back: new THREE.Vector3(0, 0.12, -1),
  threeQuarter: new THREE.Vector3(0.66, 0.18, 0.75),
};

type SlotItem = {
  id: string;
  /** Raycast target for click-to-select. */
  mesh: THREE.Object3D;
  plane: THREE.MeshStandardMaterial;
  ring: THREE.Mesh | null;
  /** World position used for click-focus and rewind camera moves. */
  anchor: THREE.Vector3;
  /** Numbered texture shown while unsold (avatar bodies only). */
  placeholder: THREE.Texture | null;
  owner: PublicCampaign["slots"][number]["owner"];
};

type TimelineStep = {
  slotId: string;
  slotName: string;
  owner: NonNullable<PublicCampaign["slots"][number]["owner"]>;
  timestamp: number;
};

function addMannequin(scene: THREE.Scene, studio: boolean): THREE.Group {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: studio ? "#c4a574" : "#d8c4a8", roughness: 0.55 });
  const shorts = new THREE.MeshStandardMaterial({ color: studio ? "#2a241c" : "#1a1a1a", roughness: 0.7 });
  const shoe = new THREE.MeshStandardMaterial({ color: "#222222" });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotZ = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rotZ;
    group.add(mesh);
    return mesh;
  };
  add(new THREE.SphereGeometry(0.16, 28, 28), skin, 0, 1.62, 0);
  add(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 16), skin, 0, 1.42, 0);
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.58, 20), new THREE.MeshStandardMaterial({ color: studio ? "#c4a574" : "#c4b5a0", roughness: 0.62 }), 0, 1.12, 0);
  add(new THREE.CylinderGeometry(0.055, 0.05, 0.58, 12), skin, 0.28, 1.18, 0, -0.18);
  add(new THREE.CylinderGeometry(0.055, 0.05, 0.58, 12), skin, -0.28, 1.18, 0, 0.18);
  add(new THREE.CylinderGeometry(0.18, 0.16, 0.18, 16), shorts, 0, 0.74, 0);
  add(new THREE.CylinderGeometry(0.075, 0.065, 0.58, 12), skin, 0.09, 0.38, 0);
  add(new THREE.CylinderGeometry(0.075, 0.065, 0.58, 12), skin, -0.09, 0.38, 0);
  add(new THREE.BoxGeometry(0.09, 0.06, 0.18), shoe, 0.09, 0.06, 0.04);
  add(new THREE.BoxGeometry(0.09, 0.06, 0.18), shoe, -0.09, 0.06, 0.04);
  scene.add(group);
  return group;
}

function loadLogo(
  logoKey: string,
  textureLoader: THREE.TextureLoader,
  textureCache: Map<string, THREE.Texture>,
  onLoad: () => void,
): THREE.Texture | null {
  let tex = textureCache.get(logoKey);
  if (!tex) {
    const url = publicFileUrl(logoKey);
    if (!url) return null;
    tex = textureLoader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      t.needsUpdate = true;
      onLoad();
    });
    textureCache.set(logoKey, tex);
  }
  return tex;
}

function updateSlotPlane(
  item: SlotItem,
  owner: PublicCampaign["slots"][number]["owner"],
  textureLoader: THREE.TextureLoader,
  textureCache: Map<string, THREE.Texture>,
  markerStyle: ArenaConfig["markerStyle"],
  isSelected: boolean,
  flash = false,
) {
  item.owner = owner;
  const accent = "#e8641c";
  if (owner?.logoKey) {
    item.plane.map = loadLogo(owner.logoKey, textureLoader, textureCache, () => (item.plane.needsUpdate = true));
    item.plane.color.set(isSelected ? accent : "#ffffff");
    item.plane.opacity = isSelected ? 1.0 : 0.95;
  } else if (item.placeholder) {
    item.plane.map = item.placeholder;
    item.plane.color.set(isSelected ? "#ffffff" : "#e9f5ff");
    item.plane.opacity = isSelected ? 1.0 : 0.9;
  } else {
    item.plane.map = null;
    item.plane.color.set(isSelected ? accent : "#f2efe6");
    item.plane.opacity = markerStyle === "outline" ? 0.12 : isSelected ? 0.7 : 0.38;
  }
  item.plane.emissive.set(flash ? accent : isSelected ? accent : "#000000");
  item.plane.emissiveIntensity = flash ? 0.7 : isSelected ? 0.35 : 0;
  item.plane.needsUpdate = true;
}

function slotMaterial(decal: boolean) {
  return new THREE.MeshStandardMaterial({
    color: "#f2efe6",
    transparent: true,
    opacity: 0.38,
    side: decal ? THREE.FrontSide : THREE.DoubleSide,
    emissive: "#000000",
    emissiveIntensity: 0,
    roughness: decal ? 0.8 : 1,
    metalness: 0,
    // Decals sit on the skin: no depth write and a polygon offset keep them from z-fighting with the body.
    depthWrite: !decal,
    polygonOffset: decal,
    polygonOffsetFactor: decal ? -4 : 0,
    polygonOffsetUnits: decal ? -4 : 0,
    // Legacy marker planes were designed without tone mapping; keep them exactly as before.
    toneMapped: decal,
  });
}

/** Legacy path: free-floating planes at world-space marker positions (procedural mannequin). */
function addPlaneSlots(
  scene: THREE.Scene,
  slots: PublicCampaign["slots"],
  markerStyle: ArenaConfig["markerStyle"],
  textureLoader: THREE.TextureLoader,
  textureCache: Map<string, THREE.Texture>,
): SlotItem[] {
  const pick: SlotItem[] = [];
  for (const slot of slots) {
    const marker = (slot.marker ?? { x: 0, y: 1, z: 0.2, scale: 0.22 }) as SlotMarker;
    const size = marker.scale ?? 0.22;
    const group = new THREE.Group();
    group.position.set(marker.x, marker.y, marker.z);
    group.userData.slotId = slot.id;

    const mat = slotMaterial(false);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.userData.slotId = slot.id;
    group.add(mesh);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(size * 0.58, 0.008, 8, 32),
      new THREE.MeshBasicMaterial({ color: "#e8641c", toneMapped: false }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    scene.add(group);

    const item: SlotItem = { id: slot.id, mesh: group, plane: mat, ring, anchor: group.position.clone(), placeholder: null, owner: slot.owner };
    updateSlotPlane(item, slot.owner, textureLoader, textureCache, markerStyle, false);
    pick.push(item);
  }
  return pick;
}

/** Avatar path: numbered decals projected onto the posed body, anchored to bones so they land on any physique. */
function addDecalSlots(
  scene: THREE.Scene,
  body: ArenaBody,
  slots: PublicCampaign["slots"],
  markerStyle: ArenaConfig["markerStyle"],
  accent: string,
  textureLoader: THREE.TextureLoader,
  textureCache: Map<string, THREE.Texture>,
): SlotItem[] {
  const pick: SlotItem[] = [];
  const raycaster = new THREE.Raycaster();
  slots.forEach((slot, index) => {
    const marker = (slot.marker ?? { x: 0, y: 1, z: 0.2, scale: 0.14 }) as SlotMarker;
    const w = marker.scale ?? 0.14;
    const h = w * (marker.aspect ?? 1);
    const hit = projectSlot(marker, body, raycaster);

    const mat = slotMaterial(true);
    const placeholder = slotPlaceholderTexture(index + 1, markerStyle, accent);
    let mesh: THREE.Mesh;
    let anchor: THREE.Vector3;
    if (hit) {
      mesh = new THREE.Mesh(makeDecalGeometry(hit, w, h), mat);
      anchor = hit.point;
    } else {
      // Ray missed the body (marker off-body): fall back to a floating plane so the slot is still sellable.
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(marker.x, marker.y, marker.z);
      anchor = mesh.position.clone();
    }
    mesh.userData.slotId = slot.id;
    mesh.renderOrder = 1;
    scene.add(mesh);

    const item: SlotItem = { id: slot.id, mesh, plane: mat, ring: null, anchor, placeholder, owner: slot.owner };
    updateSlotPlane(item, slot.owner, textureLoader, textureCache, markerStyle, false);
    pick.push(item);
  });
  return pick;
}

/** The arena has one body. Prefer the most recently attached GLB; `procedural:` keys mean the built-in mannequin. */
function bodySurface(surfaces: PublicCampaign["surfaces"]) {
  const glbs = surfaces.filter((s) => s.kind === "glb" && s.objectKey && !s.objectKey.startsWith("procedural:"));
  return glbs.length ? glbs[glbs.length - 1] : null;
}

function disposeObject(obj: THREE.Object3D) {
  const mesh = obj as THREE.Mesh;
  mesh.geometry?.dispose?.();
  const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
  for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
    for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
    m.dispose();
  }
}

export function ArenaCanvas({
  campaign,
  config,
  selectedId,
  onSelect,
  rewind = false,
}: {
  campaign: PublicCampaign;
  config: ArenaConfig;
  selectedId: string | null;
  onSelect: (id: string) => void;
  rewind?: boolean;
}) {
  const theme = THEMES[config.theme] ?? THEMES.grid;
  const [fs, setFs] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [painted, setPainted] = useState(false);
  const [rewindStatus, setRewindStatus] = useState<string>("");
  const body = bodySurface(campaign.surfaces);
  const bodyKey = body?.objectKey ?? "";
  const bodyCredit = body?.meta?.source === "avaturn";

  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const slotsRef = useRef(campaign.slots);
  const pickRef = useRef<SlotItem[]>([]);
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const textureLoaderRef = useRef<THREE.TextureLoader>(new THREE.TextureLoader());
  const sphericalRef = useRef<THREE.Spherical | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pivotRef = useRef(new THREE.Vector3(0, 0.95, 0));

  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;
  slotsRef.current = campaign.slots;

  // React to prop slot updates smoothly without resetting the WebGL scene
  useEffect(() => {
    if (rewind) return;
    const loader = textureLoaderRef.current;
    const cache = textureCacheRef.current;
    for (const p of pickRef.current) {
      const slot = campaign.slots.find((s) => s.id === p.id);
      if (slot) {
        updateSlotPlane(p, slot.owner, loader, cache, config.markerStyle, p.id === selectedId);
      }
    }
  }, [campaign.slots, selectedId, config.markerStyle, rewind]);

  // Handle rewind playback of bid history
  useEffect(() => {
    if (!rewind) {
      setRewindStatus("");
      // Reset all slots to their current live settled owner
      const loader = textureLoaderRef.current;
      const cache = textureCacheRef.current;
      for (const p of pickRef.current) {
        const slot = slotsRef.current.find((s) => s.id === p.id);
        if (slot) {
          updateSlotPlane(p, slot.owner, loader, cache, config.markerStyle, p.id === selectedRef.current);
        }
      }
      return;
    }

    // Build timeline of all settled bids across slots
    const timeline: TimelineStep[] = [];
    for (const s of slotsRef.current) {
      if (Array.isArray(s.history) && s.history.length > 0) {
        for (const h of s.history) {
          if (h) {
            timeline.push({
              slotId: s.id,
              slotName: s.name,
              owner: h,
              timestamp: h.settledAt ? new Date(h.settledAt).getTime() : 0,
            });
          }
        }
      } else if (s.owner) {
        timeline.push({
          slotId: s.id,
          slotName: s.name,
          owner: s.owner,
          timestamp: s.owner.settledAt ? new Date(s.owner.settledAt).getTime() : 0,
        });
      }
    }

    timeline.sort((a, b) => a.timestamp - b.timestamp);

    if (timeline.length === 0) {
      setRewindStatus("No settled bid history");
      return;
    }

    const loader = textureLoaderRef.current;
    const cache = textureCacheRef.current;

    // Reset all slots to empty starting state for rewind
    for (const p of pickRef.current) {
      updateSlotPlane(p, null, loader, cache, config.markerStyle, false);
    }

    let stepIndex = 0;
    let timer: NodeJS.Timeout;

    const playNext = () => {
      if (stepIndex < timeline.length) {
        const ev = timeline[stepIndex];
        const item = pickRef.current.find((p) => p.id === ev.slotId);
        if (item) {
          updateSlotPlane(item, ev.owner, loader, cache, config.markerStyle, true, true);
          // Highlight and announce
          setRewindStatus(
            `#${stepIndex + 1}/${timeline.length} · ${ev.owner.brandName} on ${ev.slotName}`
          );

          // Gently orient camera to the slot during rewind
          if (sphericalRef.current && cameraRef.current) {
            const cam = cameraRef.current;
            const target = item.anchor.clone();
            const r = sphericalRef.current.radius * 0.7;
            cam.position.set(target.x * 0.5 + 0.3, target.y + 0.4, target.z >= 0 ? r : -r);
            cam.lookAt(target);
            sphericalRef.current.setFromVector3(cam.position.clone().sub(pivotRef.current));
          }

          // Clear flash after 400ms
          setTimeout(() => {
            if (item) {
              item.plane.emissive.set("#000000");
              item.plane.emissiveIntensity = 0;
            }
          }, 400);
        }
        stepIndex++;
        timer = setTimeout(playNext, 1200);
      } else {
        setRewindStatus(`Playback complete (${timeline.length} bids) · looping`);
        timer = setTimeout(() => {
          stepIndex = 0;
          for (const p of pickRef.current) {
            updateSlotPlane(p, null, loader, cache, config.markerStyle, false);
          }
          playNext();
        }, 3000);
      }
    };

    setRewindStatus(`Rewind started (${timeline.length} events)...`);
    timer = setTimeout(playNext, 600);

    return () => {
      clearTimeout(timer);
    };
  }, [rewind, config.markerStyle]);

  useEffect(() => {
    const host = wrap.current;
    if (!host) return;
    let dead = false;
    let raf = 0;
    const canvas = document.createElement("canvas");
    canvas.dataset.arena = "gl";
    canvas.className = "absolute inset-0 z-[1] h-full w-full touch-none";
    canvas.style.display = "block";
    host.appendChild(canvas);

    const dispose = () => {
      dead = true;
      window.cancelAnimationFrame(raf);
      canvas.remove();
    };

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(theme.bg, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(theme.bg);
      scene.fog = new THREE.Fog(theme.fog, 14, 28);
      // PBR garments/skin from a GLB avatar render near-black without an environment map (Avaturn's own docs warn about this).
      // RoomEnvironment is procedural, so no HDR download.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const envRT = pmrem.fromScene(room, 0.04);
      pmrem.dispose();
      scene.environment = envRT.texture;
      scene.environmentIntensity = theme.env;

      const pivot = pivotRef.current;
      pivot.set(0, 0.95, 0);
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
      const startDir = (CAMERA_DIRS[config.startCamera] ?? CAMERA_DIRS.front).clone().normalize();
      const frame = (height: number) => {
        // Fit the standing height into the view with a little headroom.
        const dist = (height * 1.18) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        pivot.set(0, height * 0.5, 0);
        camera.position.copy(pivot).addScaledVector(startDir, dist);
        camera.lookAt(pivot);
        spherical.setFromVector3(camera.position.clone().sub(pivot));
      };
      const spherical = new THREE.Spherical();
      sphericalRef.current = spherical;
      cameraRef.current = camera;
      frame(1.9);

      const isNeon = config.theme === "neon";
      scene.add(new THREE.HemisphereLight(config.theme === "ares" ? "#ff9a6a" : isNeon ? "#9fd8ff" : "#ffffff", theme.fill, 0.85));
      scene.add(new THREE.AmbientLight(0xffffff, config.theme === "studio" ? 1.1 : 0.65));
      const key = new THREE.DirectionalLight(config.theme === "ares" ? "#ffb089" : "#ffffff", config.theme === "ares" ? 2.4 : 1.8);
      key.position.set(3.5, 7, 4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(isNeon ? "#22d3ee" : "#cde4ff", isNeon ? 0.9 : 0.55);
      fill.position.set(-4, 3, 2);
      scene.add(fill);
      if (isNeon) {
        const rim = new THREE.DirectionalLight("#22d3ee", 1.4);
        rim.position.set(0, 3, -5);
        scene.add(rim);
      }

      const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: theme.fill, roughness: 0.92 }));
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      if (config.showGrid) {
        scene.add(new THREE.GridHelper(10, 20, theme.grid[0], theme.grid[1]));
      }
      if (isNeon) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.62, 0.68, 64),
          new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.75, toneMapped: false, side: THREE.DoubleSide }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.004;
        scene.add(halo);
      }

      const glbSurface = bodySurface(campaign.surfaces);

      let mannequinGroup: THREE.Group | null = null;
      let customGlbScene: THREE.Group | null = null;
      // Snapshot tooling waits on this (data-arena-painted fires on the mannequin placeholder).
      host.dataset.avatarLoaded = "0";

      // Slot meshes own their geometry/material/placeholder; logo textures live in textureCacheRef and are reused.
      const clearSlots = () => {
        for (const p of pickRef.current) {
          scene.remove(p.mesh);
          p.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
          if (p.ring) (p.ring.material as THREE.Material).dispose();
          p.plane.dispose();
          p.placeholder?.dispose();
        }
        pickRef.current = [];
      };

      if (glbSurface) {
        // Add mannequin as immediate placeholder while GLB loads
        mannequinGroup = addMannequin(scene, config.theme === "studio");
        const gltfLoader = new GLTFLoader();
        const modelUrl = publicFileUrl(glbSurface.objectKey);
        if (modelUrl) {
          gltfLoader.load(
            modelUrl,
            (gltf) => {
              if (dead) {
                gltf.scene.traverse(disposeObject);
                return;
              }
              const model = gltf.scene;
              // Avaturn exports are rigged in T-pose: stand it naturally, then bake to static geometry
              // so raycasts and decals see the posed skin.
              relaxArms(model);
              // Exports without an outfit (Avaturn's bare templates) get a base kit painted on: sports bra + shorts.
              const bare = !hasOutfit(model);
              bakeSkinnedMeshes(model, bare ? baseKitClassifier(model) : undefined);
              if (bare) {
                model.traverse((obj) => {
                  const mesh = obj as THREE.Mesh;
                  if (mesh.isMesh && mesh.geometry.getAttribute("garment")) applyBaseKitMaterial(mesh);
                });
              }

              // Normalize GLB size & position to arena
              const box = new THREE.Box3().setFromObject(model);
              const size = new THREE.Vector3();
              box.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);
              if (maxDim > 0 && (maxDim > 5 || maxDim < 0.3)) {
                const targetScale = 1.8 / maxDim;
                model.scale.set(targetScale, targetScale, targetScale);
              }
              const updatedBox = new THREE.Box3().setFromObject(model);
              const center = new THREE.Vector3();
              updatedBox.getCenter(center);
              model.position.x -= center.x;
              model.position.z -= center.z;
              model.position.y -= updatedBox.min.y;

              model.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.frustumCulled = false;
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const m of mats) {
                  const std = m as THREE.MeshStandardMaterial;
                  // Avaturn's three.js example: crisper 1K skin/garment textures without mipmaps (hair keeps them).
                  if (std.map && !/hair/i.test(std.name)) std.map.generateMipmaps = false;
                }
              });

              if (mannequinGroup) {
                scene.remove(mannequinGroup);
                mannequinGroup.traverse(disposeObject);
                mannequinGroup = null;
              }
              customGlbScene = model;
              scene.add(model);

              const arenaBody = describeBody(model);
              frame(arenaBody.height);
              clearSlots();
              pickRef.current = addDecalSlots(
                scene,
                arenaBody,
                slotsRef.current,
                config.markerStyle,
                theme.accent,
                textureLoaderRef.current,
                textureCacheRef.current,
              );
              host.dataset.avatarLoaded = "1";
            },
            undefined,
            (err) => {
              console.warn("Custom GLB failed to load, keeping mannequin fallback:", err);
            }
          );
        }
      } else {
        mannequinGroup = addMannequin(scene, config.theme === "studio");
      }

      // Mannequin (or placeholder while the avatar loads): legacy free-floating slot planes.
      pickRef.current = addPlaneSlots(
        scene,
        slotsRef.current,
        config.markerStyle,
        textureLoaderRef.current,
        textureCacheRef.current
      );

      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      const sizeTo = () => {
        const w = Math.max(host.clientWidth || 320, 16);
        const h = Math.max(host.clientHeight || 420, 16);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      sizeTo();

      const orbit = () => {
        camera.position.setFromSpherical(spherical).add(pivot);
        camera.lookAt(pivot);
      };

      const onPointerDown = (ev: PointerEvent) => {
        dragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(
          pickRef.current.map((p) => p.mesh),
          true,
        );
        let obj: THREE.Object3D | null = hits[0]?.object ?? null;
        while (obj && typeof obj.userData.slotId !== "string") obj = obj.parent;
        const id = obj?.userData.slotId;
        if (typeof id === "string") {
          onSelectRef.current(id);
          const item = pickRef.current.find((p) => p.id === id);
          if (item) {
            // Swing to the slot's side of the body and move in a little.
            const a = item.anchor;
            const r = spherical.radius * 0.72;
            const side = new THREE.Vector3(a.x - pivot.x, 0, a.z - pivot.z);
            if (side.lengthSq() < 1e-4) side.set(0, 0, 1);
            side.normalize();
            camera.position.set(pivot.x + side.x * r, a.y + 0.35, pivot.z + side.z * r);
            camera.lookAt(a.x, a.y, a.z);
            spherical.setFromVector3(camera.position.clone().sub(pivot));
          }
        }
      };
      const onPointerMove = (ev: PointerEvent) => {
        if (!dragging) return;
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        spherical.theta -= dx * 0.008;
        spherical.phi = Math.min(Math.max(spherical.phi + dy * 0.008, 0.2), 1.45);
        orbit();
      };
      const onPointerUp = () => {
        dragging = false;
      };
      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault();
        spherical.radius = Math.min(12, Math.max(1.6, spherical.radius + ev.deltaY * 0.01));
        orbit();
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      const ro = new ResizeObserver(sizeTo);
      ro.observe(host);

      const tick = () => {
        if (dead) return;
        // Keep active selection styling accurate
        for (const p of pickRef.current) {
          const selected = p.id === selectedRef.current;
          if (p.owner?.logoKey) {
            p.plane.color.set(selected ? "#e8641c" : "#ffffff");
            p.plane.opacity = selected ? 1.0 : 0.95;
          } else if (p.placeholder) {
            p.plane.color.set(selected ? "#ffffff" : "#e9f5ff");
            p.plane.opacity = selected ? 1.0 : 0.9;
          } else {
            p.plane.color.set(selected ? "#e8641c" : "#f2efe6");
            p.plane.opacity = config.markerStyle === "outline" ? 0.12 : selected ? 0.7 : 0.38;
          }
          if (selected) {
            p.plane.emissive.set("#e8641c");
            p.plane.emissiveIntensity = 0.35;
          }
        }
        if (!config.reducedMotion && !selectedRef.current && !dragging) {
          spherical.theta += 0.004;
          orbit();
        }
        renderer.render(scene, camera);
        raf = window.requestAnimationFrame(tick);
      };
      renderer.render(scene, camera);
      setPainted(true);
      tick();

      return () => {
        dispose();
        canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
        ro.disconnect();
        // Release GPU resources while the renderer's property map is still alive, then tear the context down.
        clearSlots();
        for (const root of [mannequinGroup, customGlbScene]) {
          if (!root) continue;
          root.traverse(disposeObject);
          scene.remove(root);
        }
        scene.traverse(disposeObject);
        envRT.dispose();
        room.traverse(disposeObject);
        textureCacheRef.current.forEach((t) => t.dispose());
        textureCacheRef.current.clear();
        renderer.dispose();
        renderer.forceContextLoss();
      };
    } catch (err) {
      console.error("arena webgl", err);
      dispose();
    }
    // bodyKey: a newly attached avatar (SSE "update" → refetch) rebuilds the scene without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, bodyKey, config.markerStyle, config.reducedMotion, config.showGrid, config.startCamera, config.theme, theme.bg, theme.fill, theme.fog]);

  return (
    <div
      ref={wrap}
      className="relative h-[min(78vh,720px)] min-h-[420px] w-full border border-line"
      data-arena-painted={painted ? "1" : "0"}
      style={{ background: theme.bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/images/${campaign.id}/og`}
        alt=""
        className={`pointer-events-none absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-300 ${painted ? "opacity-0" : "opacity-90"}`}
      />
      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-ink/80 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-accent"
          onClick={() => {
            if (!wrap.current) return;
            if (!document.fullscreenElement) wrap.current.requestFullscreen();
            else document.exitFullscreen();
            setFs(!fs);
          }}
        >
          {fs ? "Exit" : "Fullscreen"}
        </button>
        {campaign.soundtrackKey && config.soundtrack && (
          <audio src={publicFileUrl(campaign.soundtrackKey)} controls loop playsInline className="h-8" />
        )}
        {rewind && (
          <span className="flex items-center gap-1.5 bg-ink/90 border border-accent/50 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-accent">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse inline-block" />
            {rewindStatus || "Rewind active"}
          </span>
        )}
      </div>
      {bodyCredit && (
        // Avaturn ToS §4 requires attribution with a link on any page showing the avatar.
        <a
          href="https://avaturn.me"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-3 z-10 bg-ink/70 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted no-underline hover:text-accent"
        >
          Avatar by Avaturn
        </a>
      )}
    </div>
  );
}
