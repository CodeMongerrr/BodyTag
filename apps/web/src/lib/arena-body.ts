import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import type { SlotFace, SlotMarker } from "@bodytag/shared";

/**
 * Turns a rigged Avaturn export (Mixamo bone names, T-pose) into the static, posed body the arena needs:
 * the same thing a photogrammetry scan gives you, so slots can be projected onto the skin as decals.
 */
export type ArenaBody = {
  root: THREE.Object3D;
  /** Baked meshes a slot may be projected onto (body, outfit, shoes — not hair/eyes). */
  surfaces: THREE.Mesh[];
  /** World-space joint positions after posing and placement, keyed by bone name. */
  bones: Map<string, THREE.Vector3>;
  /** Standing height in world units after placement. */
  height: number;
};

const NON_SURFACE = /hair|eye|teeth|tongue|lash|brow/i;

/** Relaxed A-pose: arms hang ~12° out from the body, elbows slightly forward. Rotations are applied in world space. */
export function relaxArms(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const q = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  const rotateBoneWorld = (bone: THREE.Object3D, worldRot: THREE.Quaternion) => {
    // Wb' = R · Wb  and  Wb = Wp · Lb  ⇒  Lb' = (Wp⁻¹ · R · Wp) · Lb
    bone.parent!.getWorldQuaternion(parentQ);
    q.copy(parentQ).invert().multiply(worldRot).multiply(parentQ);
    bone.quaternion.premultiply(q);
    bone.updateMatrixWorld(true);
  };

  for (const side of ["Left", "Right"] as const) {
    const arm = root.getObjectByName(`${side}Arm`);
    const fore = root.getObjectByName(`${side}ForeArm`);
    const hand = root.getObjectByName(`${side}Hand`);
    if (!arm || !fore) continue;

    arm.getWorldPosition(a);
    fore.getWorldPosition(b);
    const dir = b.sub(a).normalize();
    const out = Math.sign(dir.x) || (side === "Left" ? 1 : -1);
    const target = new THREE.Vector3(out * 0.21, -0.97, 0.06).normalize();
    rotateBoneWorld(arm, new THREE.Quaternion().setFromUnitVectors(dir, target));

    if (hand) {
      // Elbow: swing the forearm ~14° forward so the hands sit in front of the thighs.
      rotateBoneWorld(fore, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.24));
    }
  }
  root.updateMatrixWorld(true);
}

/**
 * Per-vertex garment coverage written into the baked geometry's `garment` attribute as (top, shorts) in 0..1.
 * Continuous values (feathered at the hems) interpolate to straight hem lines across triangles.
 */
export type VertexClassifier = (info: { position: THREE.Vector3; bone: string }) => [number, number];

/**
 * Replaces every SkinnedMesh under `root` with a plain Mesh whose vertices are the current pose.
 * Normals are re-skinned exactly via T(p + n) − T(p), which is the linear part of the blended bone matrix.
 * Bones stay in the hierarchy (invisible) so slot anchors can still be resolved from them.
 * `classify` (optional) sees each vertex's posed position and dominant bone and returns (top, shorts) coverage in 0..1.
 */
export function bakeSkinnedMeshes(root: THREE.Object3D, classify?: VertexClassifier) {
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });

  const p = new THREE.Vector3();
  const pn = new THREE.Vector3();
  const n = new THREE.Vector3();
  const si = new THREE.Vector4();
  const sw = new THREE.Vector4();

  for (const sm of skinned) {
    sm.skeleton.update();
    const src = sm.geometry;
    const pos = src.attributes.position;
    const nor = src.attributes.normal;
    const count = pos.count;
    normalizeSkinWeights(src);
    const outPos = new Float32Array(count * 3);
    const outNor = nor ? new Float32Array(count * 3) : null;
    const outGarment = classify ? new Float32Array(count * 2) : null;
    const skinIndex = src.attributes.skinIndex as THREE.BufferAttribute | undefined;
    const skinWeight = src.attributes.skinWeight as THREE.BufferAttribute | undefined;

    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(pos, i);
      if (outNor) {
        n.fromBufferAttribute(nor, i);
        pn.copy(p).add(n);
        sm.applyBoneTransform(i, pn);
      }
      sm.applyBoneTransform(i, p);
      outPos[i * 3] = p.x;
      outPos[i * 3 + 1] = p.y;
      outPos[i * 3 + 2] = p.z;
      if (outNor) {
        pn.sub(p).normalize();
        outNor[i * 3] = pn.x;
        outNor[i * 3 + 1] = pn.y;
        outNor[i * 3 + 2] = pn.z;
      }
      if (outGarment && skinIndex && skinWeight) {
        si.fromBufferAttribute(skinIndex, i);
        sw.fromBufferAttribute(skinWeight, i);
        const weights = [sw.x, sw.y, sw.z, sw.w];
        const indices = [si.x, si.y, si.z, si.w];
        const dominant = indices[weights.indexOf(Math.max(...weights))];
        const bone = sm.skeleton.bones[dominant]?.name ?? "";
        // Positions are in mesh space; garments are classified in the mesh's world frame.
        const [top, shorts] = classify!({ position: p.clone().applyMatrix4(sm.matrixWorld), bone });
        outGarment[i * 2] = top;
        outGarment[i * 2 + 1] = shorts;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
    if (outNor) geo.setAttribute("normal", new THREE.BufferAttribute(outNor, 3));
    if (outGarment) geo.setAttribute("garment", new THREE.BufferAttribute(outGarment, 2));
    for (const name of ["uv", "uv1", "uv2", "color"]) {
      const attr = src.getAttribute(name);
      if (attr) geo.setAttribute(name, attr.clone());
    }
    if (src.index) geo.setIndex(src.index.clone());
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, sm.material);
    mesh.name = sm.name;
    mesh.position.copy(sm.position);
    mesh.quaternion.copy(sm.quaternion);
    mesh.scale.copy(sm.scale);
    for (const m of Array.isArray(sm.material) ? sm.material : [sm.material]) m.needsUpdate = true;

    sm.parent!.add(mesh);
    sm.parent!.remove(sm);
    src.dispose();
  }
  root.updateMatrixWorld(true);
}

/**
 * glTF allows more than four influences (JOINTS_1/WEIGHTS_1); three only skins the first four, so make those sum to 1.
 * Keeps the CPU bake identical to what the GPU would have drawn.
 */
function normalizeSkinWeights(geo: THREE.BufferGeometry) {
  const w = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;
  if (!w) return;
  let touched = false;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    if (sum > 0 && Math.abs(sum - 1) > 1e-4) {
      w.setXYZW(i, w.getX(i) / sum, w.getY(i) / sum, w.getZ(i) / sum, w.getW(i) / sum);
      touched = true;
    }
  }
  if (touched) w.needsUpdate = true;
}

/** True when the export carries no outfit mesh (Avaturn names looks `avaturn_look_*`; templates ship bare). */
export function hasOutfit(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && /look|cloth|shirt|top|pants|short|dress|suit|jersey/i.test(o.name)) found = true;
  });
  return found;
}

/**
 * Base kit for bare bodies: a sports bra over the chest (Spine1/Spine2 vertices between the underbust and
 * the collarbone) and shorts from the waist to mid-thigh (Hips/UpLeg vertices). Bands are measured from the
 * posed skeleton so they land correctly on any height. Call BEFORE baking; returns the classifier.
 */
export function baseKitClassifier(root: THREE.Object3D): VertexClassifier {
  root.updateMatrixWorld(true);
  const y = (name: string) => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).y;
  const hips = y("Hips") ?? 0.95;
  const spine1 = y("Spine1") ?? hips + 0.18;
  const neck = y("Neck") ?? hips + 0.55;
  const topBottom = spine1 + 0.03;
  const topTop = neck - 0.1;
  const shortsTop = hips + 0.07;
  const shortsBottom = hips - 0.31;
  const TORSO = new Set(["Spine", "Spine1", "Spine2"]);
  const PELVIS = new Set(["Hips", "LeftUpLeg", "RightUpLeg"]);
  // 1 cm feather on each hem; the fragment stage interpolates it into a straight edge.
  const band = (y: number, bottom: number, top: number, feather = 0.01) =>
    THREE.MathUtils.clamp((y - bottom) / feather, 0, 1) * THREE.MathUtils.clamp((top - y) / feather, 0, 1);
  return ({ position, bone }) => [
    TORSO.has(bone) ? band(position.y, topBottom, topTop) : 0,
    PELVIS.has(bone) ? band(position.y, shortsBottom, shortsTop) : 0,
  ];
}

/**
 * Shades the base kit into the body material: fragments whose interpolated `garment` attribute is near a
 * class value take the fabric colour and go matte. Vertex interpolation gives soft hems for free, the body
 * geometry is untouched, and slot decals keep projecting onto the same mesh.
 */
export function applyBaseKitMaterial(mesh: THREE.Mesh, colors = { top: "#14161c", shorts: "#0c0e13" }) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    const std = m as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial) continue;
    const top = new THREE.Color(colors.top);
    const shorts = new THREE.Color(colors.shorts);
    std.onBeforeCompile = (shader) => {
      shader.uniforms.kitTop = { value: top };
      shader.uniforms.kitShorts = { value: shorts };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 garment;\nvarying vec2 vGarment;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGarment = garment;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          [
            "#include <common>",
            "uniform vec3 kitTop;",
            "uniform vec3 kitShorts;",
            "varying vec2 vGarment;",
            // Coverage is feathered per vertex; snap it to a crisp hem in the fragment stage.
            "float kitMix(float c) { return smoothstep(0.45, 0.55, c); }",
          ].join("\n"),
        )
        .replace(
          "#include <color_fragment>",
          [
            "#include <color_fragment>",
            "diffuseColor.rgb = mix(diffuseColor.rgb, kitTop, kitMix(vGarment.x));",
            "diffuseColor.rgb = mix(diffuseColor.rgb, kitShorts, kitMix(vGarment.y));",
          ].join("\n"),
        )
        .replace(
          "#include <roughnessmap_fragment>",
          ["#include <roughnessmap_fragment>", "roughnessFactor = mix(roughnessFactor, 0.95, max(kitMix(vGarment.x), kitMix(vGarment.y)));"].join("\n"),
        );
    };
    std.customProgramCacheKey = () => "bodytag-base-kit";
    std.needsUpdate = true;
  }
}

/** After the scene is scaled/placed, collect what slot placement needs. */
export function describeBody(root: THREE.Object3D): ArenaBody {
  root.updateMatrixWorld(true);
  const surfaces: THREE.Mesh[] = [];
  const bones = new Map<string, THREE.Vector3>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o.getWorldPosition(new THREE.Vector3()));
    else if ((o as THREE.Mesh).isMesh && !NON_SURFACE.test(o.name)) surfaces.push(o as THREE.Mesh);
  });
  const box = new THREE.Box3().setFromObject(root);
  return { root, surfaces, bones, height: box.max.y - box.min.y };
}

const FACE_DIR: Record<SlotFace, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(1, 0, 0),
  right: new THREE.Vector3(-1, 0, 0),
};

export type SlotHit = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
  face: SlotFace;
};

/**
 * Resolve where a slot sits on the body. Bone-anchored markers start from the joint (+ offset); legacy markers from
 * their world position. Either way we shoot a ray from outside the body along `face` and take the first skin hit.
 */
export function projectSlot(marker: SlotMarker, body: ArenaBody, raycaster = new THREE.Raycaster()): SlotHit | null {
  const face: SlotFace = marker.face ?? "front";
  const dir = FACE_DIR[face];
  const base =
    marker.bone && body.bones.has(marker.bone)
      ? body.bones.get(marker.bone)!.clone().add(new THREE.Vector3(marker.dx ?? 0, marker.dy ?? 0, marker.dz ?? 0))
      : new THREE.Vector3(marker.x, marker.y, marker.z);

  const origin = base.clone().addScaledVector(dir, 1.5);
  raycaster.set(origin, dir.clone().negate());
  raycaster.far = 3;
  const hit = raycaster.intersectObjects(body.surfaces, false).find((h) => h.face);
  if (!hit || !hit.face) return null;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  return { point: hit.point.clone(), normal, mesh: hit.object as THREE.Mesh, face };
}

/** Project a `w × h` decal onto the hit surface. Depth is kept shallow so it wraps a limb without bleeding to the far side. */
export function makeDecalGeometry(hit: SlotHit, w: number, h: number): THREE.BufferGeometry {
  const depth = hit.face === "left" || hit.face === "right" ? 0.09 : 0.08;
  const helper = new THREE.Object3D();
  helper.position.copy(hit.point);
  helper.lookAt(hit.point.clone().add(hit.normal));
  // Centre the projector slightly inside the surface so curvature falling away from the hit point is still covered.
  const position = hit.point.clone().addScaledVector(hit.normal, -depth * 0.2);
  return new DecalGeometry(hit.mesh, position, helper.rotation, new THREE.Vector3(w, h, depth));
}

/** Numbered placeholder for an unsold slot — reads as inventory, like the numbered squares on a race-day jersey. */
export function slotPlaceholderTexture(number: number, style: "filled" | "outline", accent = "#e8641c"): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const r = 28;
  const inset = 10;
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, r);
  if (style === "filled") {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fill();
  }
  ctx.lineWidth = 10;
  ctx.strokeStyle = accent;
  ctx.setLineDash(style === "outline" ? [22, 14] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = accent;
  ctx.font = "bold 128px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), size / 2, size / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
