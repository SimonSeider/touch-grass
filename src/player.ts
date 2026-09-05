import * as THREE from 'three';

export type HeightFn = (x: number, z: number) => number;

export interface PlayerTuning {
  sensitivity: number;
  invertY: boolean;
  walkSpeed: number;
  runSpeed: number;
  jumpHeight: number;
  sprintToggle: boolean;
  acceleration: number;
  friction: number;
  airControl: number;
  slopeLimit: number;
  slide: boolean;
  momentum: boolean;
}

export interface Player {
  update: (dt: number) => void;
  lock: () => void;
  isWalking: () => boolean;
  isSliding: () => boolean;
  speed: () => number;
  setPaused: (paused: boolean) => void;
  setTuning: (tuning: Partial<PlayerTuning>) => void;
  position: () => THREE.Vector3;
}

const EYE_STAND = 1.65;
const EYE_CROUCH = 1.0;
const EYE_SLIDE = 0.72;
const EYE_SMOOTH = 0.085;

const GRAVITY = 24;
const LOOK_SPEED = 0.0022;

const STOP_SPEED = 1.6;
const NORMAL_EPS = 0.35;
const SLIP_BAND = 6;
const SLOPE_ASSIST = 0.9;

const CROUCH_SPEED_SCALE = 0.45;
const SLIDE_MIN_SPEED = 2.5;
const SLIDE_END_SPEED = 1.8;
const SLIDE_BOOST = 1.25;
const SLIDE_MAX_BOOST = 1.4;
const SLIDE_FRICTION = 1.5;
const SLIDE_STEER = 4.5;
const SLIDE_COOLDOWN = 0.5;
const MOMENTUM_DRAG = 0.35;

const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.12;
const SNAP_LOCK = 0.1;

interface Keys {
  w: boolean; s: boolean; a: boolean; d: boolean;
  shift: boolean; space: boolean; crouch: boolean;
}

export function createPlayer(camera: THREE.PerspectiveCamera, heightAt: HeightFn): Player {
  camera.rotation.order = 'YXZ';

  const keys: Keys = { w: false, s: false, a: false, d: false, shift: false, space: false, crouch: false };
  let yaw = 0;
  let pitch = 0;

  const feet = new THREE.Vector3(0, heightAt(0, 0), 0);
  const velocity = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 1, 0);
  const wishDir = new THREE.Vector2();

  let eyeHeight = EYE_STAND;
  let grounded = true;
  let locked = false;
  let started = false;
  let dragging = false;

  let crouching = false;
  let sliding = false;
  let slipping = 0;
  let slideLocked = false;
  let slideCooldown = 0;
  let coyote = 0;
  let jumpBuffer = 0;
  let jumpQueued = false;
  let snapLock = 0;

  let paused = false;
  let hadLockBeforePause = false;
  let sprinting = false;

  camera.position.set(feet.x, feet.y + eyeHeight, feet.z);

  const tuning: PlayerTuning = {
    sensitivity: 1,
    invertY: false,
    walkSpeed: 3.4,
    runSpeed: 6.2,
    jumpHeight: 1.4,
    sprintToggle: false,
    acceleration: 14,
    friction: 10,
    airControl: 0.15,
    slopeLimit: 22,
    slide: true,
    momentum: false,
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
      case 'Space':
        if (!keys.space) jumpQueued = true;
        keys.space = true;
        if (!paused) e.preventDefault();
        break;
      case 'KeyC': keys.crouch = true; break;
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
      case 'KeyC': keys.crouch = false; slideLocked = false; break;
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
      dragging = false;
    }
  });

  function lock() {
    started = true;
    requestLock();
  }

  document.addEventListener('click', () => {
    if (!started || locked || paused) return;
    requestLock();
  });

  function horizontalSpeed() {
    return Math.hypot(velocity.x, velocity.z);
  }

  function sampleNormal(x: number, z: number) {
    const gx = (heightAt(x + NORMAL_EPS, z) - heightAt(x - NORMAL_EPS, z)) / (2 * NORMAL_EPS);
    const gz = (heightAt(x, z + NORMAL_EPS) - heightAt(x, z - NORMAL_EPS)) / (2 * NORMAL_EPS);
    normal.set(-gx, 1, -gz).normalize();
  }

  function brakeTo(target: number, coefficient: number, dt: number) {
    const speed = horizontalSpeed();
    if (speed <= target || speed <= 0) return;
    const drop = Math.max(speed, STOP_SPEED) * coefficient * dt;
    const scale = Math.max(speed - drop, target) / speed;
    velocity.x *= scale;
    velocity.z *= scale;
  }

  function accelerate(wishSpeed: number, accel: number, dt: number) {
    if (wishSpeed <= 0 || accel <= 0) return;
    const current = velocity.x * wishDir.x + velocity.z * wishDir.y;
    const missing = wishSpeed - current;
    if (missing <= 0) return;
    const step = Math.min(accel * dt, missing);
    velocity.x += wishDir.x * step;
    velocity.z += wishDir.y * step;
  }

  function scrubLateral(coefficient: number, dt: number) {
    const along = velocity.x * wishDir.x + velocity.z * wishDir.y;
    const lx = velocity.x - wishDir.x * along;
    const lz = velocity.z - wishDir.y * along;
    const lateral = Math.hypot(lx, lz);
    if (lateral <= 1e-4) return;
    const drop = Math.max(lateral, STOP_SPEED) * coefficient * dt;
    const scale = Math.max(lateral - drop, 0) / lateral;
    velocity.x = wishDir.x * along + lx * scale;
    velocity.z = wishDir.y * along + lz * scale;
  }

  function steerSlide(dt: number) {
    let ax = wishDir.x;
    let az = wishDir.y;
    const speed = horizontalSpeed();
    if (speed > 0.1) {
      const dx = velocity.x / speed;
      const dz = velocity.z / speed;
      const along = ax * dx + az * dz;
      ax -= dx * along;
      az -= dz * along;
    }
    const len = Math.hypot(ax, az);
    if (len < 1e-4) return;
    velocity.x += (ax / len) * SLIDE_STEER * dt;
    velocity.z += (az / len) * SLIDE_STEER * dt;
  }

  function update(dt: number) {
    if (paused || dt <= 0) return;

    slideCooldown = Math.max(0, slideCooldown - dt);
    snapLock = Math.max(0, snapLock - dt);

    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    wishDir.set(0, 0);
    if (keys.w) wishDir.set(wishDir.x - sinYaw, wishDir.y - cosYaw);
    if (keys.s) wishDir.set(wishDir.x + sinYaw, wishDir.y + cosYaw);
    if (keys.d) wishDir.set(wishDir.x + cosYaw, wishDir.y - sinYaw);
    if (keys.a) wishDir.set(wishDir.x - cosYaw, wishDir.y + sinYaw);
    const moving = wishDir.lengthSq() > 0;
    if (moving) wishDir.normalize();

    sampleNormal(feet.x, feet.z);
    const slopeAngle = Math.acos(Math.min(1, normal.y)) * (180 / Math.PI);
    const limit = tuning.slopeLimit;
    const slipT = Math.min(Math.max((slopeAngle - limit) / SLIP_BAND, 0), 1);
    const slip = slipT * slipT * (3 - 2 * slipT);
    slipping = slip;

    const speedNow = horizontalSpeed();

    if (sliding) {
      const done = !keys.crouch || !tuning.slide || (grounded && speedNow < SLIDE_END_SPEED && slip < 0.5);
      if (done) {
        sliding = false;
        slideCooldown = SLIDE_COOLDOWN;
        if (keys.crouch) slideLocked = true;
      }
    } else if (keys.crouch && tuning.slide && grounded && !slideLocked && speedNow >= SLIDE_MIN_SPEED) {
      sliding = true;
      if (slideCooldown <= 0) {
        const boosted = tuning.momentum
          ? speedNow * SLIDE_BOOST
          : Math.min(speedNow * SLIDE_BOOST, tuning.runSpeed * SLIDE_MAX_BOOST);
        if (boosted > speedNow) {
          velocity.x *= boosted / speedNow;
          velocity.z *= boosted / speedNow;
        }
      }
    }
    crouching = keys.crouch && !sliding;
    const running = (tuning.sprintToggle ? sprinting : keys.shift) && !crouching;

    const slopePull = GRAVITY * normal.y;
    const slopeStrength = sliding ? 1 : slip;

    if (grounded) {
      let wishSpeed = 0;
      if (moving && !sliding) {
        wishSpeed = crouching
          ? tuning.walkSpeed * CROUCH_SPEED_SCALE
          : running ? tuning.runSpeed : tuning.walkSpeed;
        const grade = wishDir.x * normal.x + wishDir.y * normal.z;
        wishSpeed *= Math.min(Math.max(1 + SLOPE_ASSIST * grade, 0.35), 1.3);
        wishSpeed *= 1 - slip;
      }

      const friction = sliding
        ? SLIDE_FRICTION
        : tuning.friction + (SLIDE_FRICTION - tuning.friction) * slip;
      if (tuning.momentum && moving && !sliding) brakeTo(wishSpeed, MOMENTUM_DRAG, dt);
      else brakeTo(sliding ? 0 : wishSpeed, friction, dt);

      if (slopeStrength > 0) {
        velocity.x += normal.x * slopePull * slopeStrength * dt;
        velocity.z += normal.z * slopePull * slopeStrength * dt;
      }

      if (sliding) {
        if (moving) steerSlide(dt);
      } else if (moving) {
        scrubLateral(tuning.momentum ? MOMENTUM_DRAG : friction, dt);
        accelerate(wishSpeed, tuning.acceleration * wishSpeed * (1 - 0.85 * slip), dt);
      }
    } else if (moving) {
      const wishSpeed = running ? tuning.runSpeed : tuning.walkSpeed;
      accelerate(wishSpeed, tuning.acceleration * wishSpeed * tuning.airControl, dt);
    }

    if (tuning.momentum && keys.space) jumpQueued = true;
    if (jumpQueued) {
      jumpBuffer = JUMP_BUFFER;
      jumpQueued = false;
    }
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    coyote = grounded ? COYOTE_TIME : Math.max(0, coyote - dt);

    if (jumpBuffer > 0 && coyote > 0) {
      velocity.y = Math.sqrt(2 * GRAVITY * tuning.jumpHeight);
      jumpBuffer = 0;
      coyote = 0;
      grounded = false;
      snapLock = SNAP_LOCK;
      if (sliding) {
        sliding = false;
        slideCooldown = SLIDE_COOLDOWN;
        if (keys.crouch) slideLocked = true;
      }
    }

    velocity.y -= GRAVITY * dt;

    const wasGrounded = grounded;
    feet.x += velocity.x * dt;
    feet.z += velocity.z * dt;
    feet.y += velocity.y * dt;

    const groundY = heightAt(feet.x, feet.z);
    if (feet.y <= groundY) {
      feet.y = groundY;
      if (velocity.y < 0) velocity.y = 0;
      grounded = true;
    } else if (wasGrounded && snapLock <= 0 && velocity.y <= 0
      && feet.y - groundY <= 0.25 + horizontalSpeed() * dt * 1.5) {
      feet.y = groundY;
      velocity.y = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    const targetEye = sliding ? EYE_SLIDE : crouching ? EYE_CROUCH : EYE_STAND;
    eyeHeight += (targetEye - eyeHeight) * (1 - Math.exp(-dt / EYE_SMOOTH));

    camera.position.set(feet.x, feet.y + eyeHeight, feet.z);
  }

  return {
    update,
    lock,
    isWalking() {
      return grounded && !sliding && slipping < 0.5 && Math.hypot(velocity.x, velocity.z) > 0.5;
    },
    isSliding() {
      return sliding;
    },
    speed() {
      return Math.hypot(velocity.x, velocity.z);
    },
    setTuning(next) {
      Object.assign(tuning, next);
      if (!tuning.sprintToggle) sprinting = false;
      if (!tuning.slide) sliding = false;
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
