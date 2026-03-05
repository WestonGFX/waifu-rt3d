/**
 * BVH (Biovision Hierarchy) file loader for Three.js.
 *
 * Parses BVH motion capture files and converts them to THREE.AnimationClip
 * objects with quaternion rotation tracks. Supports both position and
 * rotation channels.
 *
 * Based on Three.js r157 examples/jsm/loaders/BVHLoader.js (MIT license).
 * Simplified for use in the waifu-rt3d viewer.
 *
 * @example
 *   const loader = new BVHLoader();
 *   loader.load('/animations/walk.bvh', (result) => {
 *     const clip = result.clip;
 *     const skeleton = result.skeleton;
 *     mixer.clipAction(clip).play();
 *   });
 */

/* global THREE */

class BVHLoader {
  constructor(manager) {
    this.manager = manager || THREE.DefaultLoadingManager;
    this.animateBonePositions = true;
    this.animateBoneRotations = true;
  }

  /**
   * Load a BVH file from a URL.
   *
   * @param {string} url - URL of the BVH file
   * @param {Function} onLoad - Callback with { clip, skeleton }
   * @param {Function} [onProgress] - Progress callback
   * @param {Function} [onError] - Error callback
   */
  load(url, onLoad, onProgress, onError) {
    const loader = new THREE.FileLoader(this.manager);
    loader.setPath(this.path || '');
    loader.setRequestHeader(this.requestHeader || {});
    loader.setWithCredentials(this.withCredentials || false);
    loader.load(url, (text) => {
      try {
        onLoad(this.parse(text));
      } catch (e) {
        if (onError) onError(e);
        else console.error(e);
        this.manager.itemError(url);
      }
    }, onProgress, onError);
  }

  /**
   * Parse BVH text content into a clip and skeleton.
   *
   * @param {string} text - Raw BVH file content
   * @returns {{ clip: THREE.AnimationClip, skeleton: THREE.Skeleton }}
   */
  parse(text) {
    const lines = text.split(/[\r\n]+/g);
    const bones = [];
    let frameTime = 0;
    let frameCount = 0;

    // Parse hierarchy
    let i = 0;
    const boneStack = [];

    function readHierarchy() {
      while (i < lines.length) {
        const line = lines[i].trim();
        i++;

        if (line === '') continue;

        const tokens = line.split(/\s+/);

        if (tokens[0] === 'ROOT' || tokens[0] === 'JOINT' || tokens[0] === 'End') {
          const isEnd = tokens[0] === 'End';
          const name = isEnd ? (boneStack.length > 0 ? boneStack[boneStack.length - 1].name + '_End' : 'End') : tokens[1];

          const bone = {
            name,
            offset: new THREE.Vector3(),
            channels: [],
            children: [],
            parent: boneStack.length > 0 ? boneStack[boneStack.length - 1] : null,
            isEnd: isEnd,
          };

          if (bone.parent) bone.parent.children.push(bone);
          bones.push(bone);
          boneStack.push(bone);
        } else if (tokens[0] === '{') {
          // Start of block
        } else if (tokens[0] === '}') {
          boneStack.pop();
          if (boneStack.length === 0) return;
        } else if (tokens[0] === 'OFFSET') {
          const current = boneStack[boneStack.length - 1];
          current.offset.set(
            parseFloat(tokens[1]),
            parseFloat(tokens[2]),
            parseFloat(tokens[3])
          );
        } else if (tokens[0] === 'CHANNELS') {
          const current = boneStack[boneStack.length - 1];
          const count = parseInt(tokens[1]);
          for (let c = 0; c < count; c++) {
            current.channels.push(tokens[c + 2]);
          }
        }
      }
    }

    // Find HIERARCHY section
    while (i < lines.length && lines[i].trim() !== 'HIERARCHY') i++;
    i++;
    readHierarchy();

    // Find MOTION section
    while (i < lines.length) {
      const line = lines[i].trim();
      i++;
      if (line.startsWith('Frames:')) {
        frameCount = parseInt(line.split(':')[1]);
      } else if (line.startsWith('Frame Time:')) {
        frameTime = parseFloat(line.split(':')[1]);
        break;
      }
    }

    // Parse motion data
    const motionData = [];
    while (i < lines.length) {
      const line = lines[i].trim();
      i++;
      if (line === '') continue;
      motionData.push(line.split(/\s+/).map(parseFloat));
    }

    // Build Three.js objects
    const threeBones = [];
    const boneMap = new Map();

    for (const bone of bones) {
      const threeBone = new THREE.Bone();
      threeBone.name = bone.name;
      threeBone.position.copy(bone.offset);
      threeBones.push(threeBone);
      boneMap.set(bone, threeBone);

      if (bone.parent) {
        const parentBone = boneMap.get(bone.parent);
        if (parentBone) parentBone.add(threeBone);
      }
    }

    // Build animation tracks
    const tracks = [];
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();

    for (const bone of bones) {
      if (bone.channels.length === 0) continue;

      const times = [];
      const positions = [];
      const rotations = [];

      let channelOffset = 0;
      for (const b of bones) {
        if (b === bone) break;
        channelOffset += b.channels.length;
      }

      for (let f = 0; f < motionData.length; f++) {
        const frame = motionData[f];
        times.push(f * frameTime);

        let px = bone.offset.x, py = bone.offset.y, pz = bone.offset.z;
        let rx = 0, ry = 0, rz = 0;

        for (let c = 0; c < bone.channels.length; c++) {
          const ch = bone.channels[c];
          const val = frame[channelOffset + c];

          switch (ch) {
            case 'Xposition': px = val; break;
            case 'Yposition': py = val; break;
            case 'Zposition': pz = val; break;
            case 'Xrotation': rx = val * (Math.PI / 180); break;
            case 'Yrotation': ry = val * (Math.PI / 180); break;
            case 'Zrotation': rz = val * (Math.PI / 180); break;
          }
        }

        if (this.animateBonePositions && bone.channels.some(c => c.includes('position'))) {
          positions.push(px, py, pz);
        }

        if (this.animateBoneRotations && bone.channels.some(c => c.includes('rotation'))) {
          // Determine rotation order from channel order
          const rotOrder = bone.channels
            .filter(c => c.includes('rotation'))
            .map(c => c[0])
            .join('');
          euler.set(rx, ry, rz, rotOrder || 'ZYX');
          quaternion.setFromEuler(euler);
          rotations.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
      }

      const timeArray = new Float32Array(times);

      if (positions.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(
          bone.name + '.position',
          timeArray,
          new Float32Array(positions)
        ));
      }

      if (rotations.length > 0) {
        tracks.push(new THREE.QuaternionKeyframeTrack(
          bone.name + '.quaternion',
          timeArray,
          new Float32Array(rotations)
        ));
      }
    }

    const clip = new THREE.AnimationClip('BVH', -1, tracks);
    const skeleton = new THREE.Skeleton(threeBones);

    return { clip, skeleton };
  }
}

// Make it globally available (script tag, not ES module)
window.BVHLoader = BVHLoader;
