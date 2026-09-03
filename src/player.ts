import * as THREE from 'three';

export type HeightFn = (x: number, z: number) => number;

export interface PlayerTuning {
  sensitivity: number;
  invertY: boolean;
  walkSpeed: number;
  runSpeed: number;
  /** Peak height of a jump, in metres. */
  jumpHeight: number;
  sprintToggle: boolean;
}

export interface Player {
  update: (dt: number) => void;
  lock: () => void;
  isWalking: () => boolean;
  setPaused: (paused: boolean) => void;
  setTuning: (tuning: Partial<PlayerTuning>) => void;
  position: () => THREE.Vector3;
}

const EYE = 1.65;
const GRAVITY = 24;
const RADIUS = 0.4;
const LOOK_SPEED = 0.0022;

interface Keys {
  w: boolean; s: boolean; a: boolean; d: boolean;
  shift: boolean; space: boolean; ctrl: boolean;
}

export function createPlayer(camera: THREE.PerspectiveCamera, heightAt: HeightFn): Player {
  camera.rotation.order = 'YXZ';
  camera.position.set(0, heightAt(0, 0) + EYE, 0);

  const keys: Keys = { w: false, s: false, a: false, d: false, shift: false, space: false, ctrl: false };
  let yaw = 0;
  let pitch = 0;
  let velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let grounded = false;
  let locked = false;
  let started = false;
  let dragging = false;
  let hasPointerLockEver = false;

  let crouching = false;
  let paused = false;
  let hadLockBeforePause = false;
  let sprinting = false;

  const tuning: PlayerTuning = {
    sensitivity: 1,
    invertY: false,
    walkSpeed: 3.4,
    runSpeed: 6.2,
    jumpHeight: 1.4,
    sprintToggle: false,
  };

  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': keys.w = true; break;
      case 'KeyS': keys.s = true; break;
      case 'KeyA': keys.a = true; break;
      case 'KeyD': keys.d = true; break;
      case 'ShiftLeft': case 'ShiftRight':
        if (tuning.sprintToggle && !keys.shift) sprinting = !sprinting;
        keys.shift = true;
        break;
      case 'Space': keys.space = true; if (!paused) e.preventDefault(); break;
      case 'ControlLeft': keys.ctrl = true; break;
    }
  });
  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': keys.w = false; break;
      case 'KeyS': keys.s = false; break;
      case 'KeyA': keys.a = false; break;
      case 'KeyD': keys.d = false; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
      case 'Space': keys.space = false; break;
      case 'ControlLeft': keys.ctrl = false; break;
    }
  });

  const brush = new THREE.Vector2();
  const lastPointer = new THREE.Vector2();
  function applyLook(dx: number, dy: number) {
    const speed = LOOK_SPEED * tuning.sensitivity;
    yaw -= dx * speed;
    pitch -= dy * speed * (tuning.invertY ? -1 : 1);
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  function onLook(dx: number, dy: number) {
    if (!started || paused) return;
    if (locked) {
      applyLook(dx, dy);
    } else if (dragging) {
      applyLook(dx, dy);
    }
  }

  document.addEventListener('mousemove', (e) => {
    if (locked) onLook(e.movementX, e.movementY);
  });

  function setLook(e: MouseEvent) {
    if (!started || locked || paused) return;
    lastPointer.set(e.clientX, e.clientY);
    dragging = true;
  }
  function moveLook(e: MouseEvent) {
    if (!started || locked || !dragging || paused) return;
    brush.set(e.clientX, e.clientY).sub(lastPointer);
    lastPointer.set(e.clientX, e.clientY);
    onLook(brush.x, brush.y);
  }
  function endLook() {
    dragging = false;
  }

  document.addEventListener('mousedown', setLook);
  document.addEventListener('mousemove', moveLook);
  window.addEventListener('mouseup', endLook);

  function requestLock() {
    if (locked || document.pointerLockElement) return;
    const el = document.body as unknown as {
      requestPointerLock?: () => void | Promise<void>;
    };
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => { });
      }
    } catch {
    }
  }
  document.addEventListener('pointerlockerror', () => {
    locked = false;
    dragging = false;
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === document.body;
    if (locked) {
      hasPointerLockEver = true;
      dragging = false;
    }
  });

  function lock() {
    started = true;
    requestLock();
  }

  document.addEventListener('click', (e) => {
    if (!started || locked || paused) return;
    requestLock();
  });

  function update(dt: number) {
    if (paused) return;
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const running = tuning.sprintToggle ? sprinting : keys.shift;
    const speed = running ? tuning.runSpeed : tuning.walkSpeed;
    const wish = new THREE.Vector3();
    if (keys.w) wish.add(forward);
    if (keys.s) wish.sub(forward);
    if (keys.d) wish.add(right);
    if (keys.a) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    const accel = grounded ? 14 : 3;
    velocity.x += (wish.x - velocity.x) * Math.min(1, accel * dt);
    velocity.z += (wish.z - velocity.z) * Math.min(1, accel * dt);

    if (keys.space && grounded) {
      velocity.y = Math.sqrt(2 * GRAVITY * tuning.jumpHeight);
      grounded = false;
    }

    velocity.y -= GRAVITY * dt;

    camera.position.x += velocity.x * dt;
    camera.position.z += velocity.z * dt;
    camera.position.y += velocity.y * dt;

    const ground = heightAt(camera.position.x, camera.position.z) + EYE;
    if (camera.position.y <= ground) {
      camera.position.y = ground;
      velocity.y = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    crouching = keys.ctrl;
    if (crouching && grounded) {
      const target = heightAt(camera.position.x, camera.position.z) + EYE * 0.5;
      camera.position.y = Math.max(camera.position.y - dt * 3.0, target);
    }
  }

  return {
    update,
    lock,
    isWalking() {
      return grounded && Math.hypot(velocity.x, velocity.z) > 0.5;
    },
    setTuning(next) {
      Object.assign(tuning, next);
      if (!tuning.sprintToggle) sprinting = false;
    },
    position() {
      return camera.position;
    },
    setPaused(value: boolean) {
      paused = value;
      if (value) {
        hadLockBeforePause = locked;
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        if (hadLockBeforePause && !document.pointerLockElement) requestLock();
      }
    },
  };
}
