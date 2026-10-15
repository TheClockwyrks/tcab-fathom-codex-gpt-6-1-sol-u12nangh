import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { draw } from "./render";
export const BACKGROUND = "#030b12";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: [number, number] | null;
  linger: number;
  alertLeft: number;
  mark: number;
  ping: number;
  lastPing: number;
  search: number;
  searchPing: boolean;
  flare: number;
  phase: number;
  chaseSpeed: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number;
  caught: boolean;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body;
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: { x: number; y: number; radius: number; remaining: number }[];
  simTime: number;
  remainder: number;
  timer: number;
  liveTime: number;
  desired: Direction;
  rng: number;
  pointerDown: Record<number, number>;
  assets: Record<string, ImageBitmap[]>;
}
export type ReadState = DeepReadonly<FathomState>;
export const dirs: Direction[] = ["up", "right", "down", "left"];
const vectors = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
} as const;
export function center(tx: number, ty: number): Body {
  return {
    x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
    y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
    tx,
    ty,
    dir: "up",
    moving: false,
  };
}
export function clone(s: ReadState): FathomState {
  return {
    ...JSON.parse(JSON.stringify({ ...s, assets: {} })),
    assets: s.assets,
  } as FathomState;
}
export function tile(s: ReadState, x: number, y: number) {
  return s.tiles[y]?.[x] ?? "#";
}
export function neighbor(
  s: ReadState,
  x: number,
  y: number,
  d: Direction,
): [number, number] {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  if (ny === y && tile(s, 0, y) !== "#" && tile(s, C.GRID_COLS - 1, y) !== "#")
    nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return [nx, ny];
}
function open(s: ReadState, x: number, y: number, pred = false) {
  const t = tile(s, x, y);
  return t === "." || (pred && (t === "d" || t === "g"));
}
function opposite(d: Direction) {
  return dirs[(dirs.indexOf(d) + 2) % 4];
}
export function replace(rows: string[], x: number, y: number, c: string) {
  rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
}
function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
function random(s: FathomState) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export function distances(s: ReadState, tx: number, ty: number, pred = false) {
  const map = new Map<string, number>();
  const q: [[number, number], number][] = [[[tx, ty], 0]];
  if (!open(s, tx, ty, pred)) return map;
  map.set(`${tx},${ty}`, 0);
  for (let i = 0; i < q.length; i++) {
    const [[x, y], n] = q[i];
    for (const d of dirs) {
      const [nx, ny] = neighbor(s, x, y, d),
        k = `${nx},${ny}`;
      if (open(s, nx, ny, pred) && !map.has(k)) {
        map.set(k, n + 1);
        q.push([[nx, ny], n + 1]);
      }
    }
  }
  return map;
}
function route(
  s: FathomState,
  b: Body,
  target: [number, number] | null,
  pred: boolean,
): Direction | null {
  let options = dirs.filter((d) =>
    open(s, ...neighbor(s, b.tx, b.ty, d), pred),
  );
  if (target) {
    const map = distances(s, ...target, pred);
    options.sort(
      (a, c) =>
        (map.get(neighbor(s, b.tx, b.ty, a).join(",")) ?? Infinity) -
        (map.get(neighbor(s, b.tx, b.ty, c).join(",")) ?? Infinity),
    );
    return options[0] ?? null;
  }
  const forward = options.filter((d) => d !== opposite(b.dir));
  if (forward.length) options = forward;
  return options[Math.floor(random(s) * options.length)] ?? null;
}
function move(
  s: FathomState,
  b: Body,
  speed: number,
  pred: boolean,
  choose: () => Direction | null,
) {
  if (!open(s, b.tx, b.ty, pred)) {
    b.moving = false;
    return;
  }
  let left = speed * C.TICK_DT;
  b.moving = false;
  while (left > 1e-8) {
    const cx = center(b.tx, b.ty);
    const at = Math.abs(b.x - cx.x) < 1e-7 && Math.abs(b.y - cx.y) < 1e-7;
    if (at) {
      const d = choose();
      if (!d || !open(s, ...neighbor(s, b.tx, b.ty, d), pred)) return;
      b.dir = d;
    }
    const [dx, dy] = vectors[b.dir];
    let distance = dx
      ? dx > 0
        ? (Math.floor((b.x - C.GRID_ORIGIN_X - C.TILE / 2 + 1e-7) / C.TILE) +
            1) *
            C.TILE +
          C.GRID_ORIGIN_X +
          C.TILE / 2 -
          b.x
        : b.x -
          ((Math.ceil((b.x - C.GRID_ORIGIN_X - C.TILE / 2 - 1e-7) / C.TILE) -
            1) *
            C.TILE +
            C.GRID_ORIGIN_X +
            C.TILE / 2)
      : dy > 0
        ? (Math.floor((b.y - C.GRID_ORIGIN_Y - C.TILE / 2 + 1e-7) / C.TILE) +
            1) *
            C.TILE +
          C.GRID_ORIGIN_Y +
          C.TILE / 2 -
          b.y
        : b.y -
          ((Math.ceil((b.y - C.GRID_ORIGIN_Y - C.TILE / 2 - 1e-7) / C.TILE) -
            1) *
            C.TILE +
            C.GRID_ORIGIN_Y +
            C.TILE / 2);
    distance = Math.min(left, distance);
    b.x += dx * distance;
    b.y += dy * distance;
    if (b.x < C.GRID_ORIGIN_X) b.x += C.GRID_COLS * C.TILE;
    if (b.x >= C.GRID_ORIGIN_X + C.GRID_COLS * C.TILE)
      b.x -= C.GRID_COLS * C.TILE;
    locate(b);
    left -= distance;
    b.moving = true;
  }
}
export function makePred(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
  slot: number | null,
): Predator {
  return {
    ...center(tx, ty),
    lit: false,
    mind: true,
    travel: true,
    kind,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    ping: C.GLOAMFIN_PING_INTERVAL,
    lastPing: -C.GLOAMFIN_PING_MIN_GAP,
    search: 0,
    searchPing: false,
    flare: C.FLARE_INTERVAL,
    phase: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    slot,
  };
}
export function roster(depth: number) {
  return [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth - 1, C.ROSTER_CAP_DEPTH - 1)),
  ].map((k, i) => makePred(k, 16 + (i % 4), 8 + Math.floor(i / 4), i));
}
function maze(): string[] {
  const a = Array.from({ length: C.GRID_ROWS }, () =>
    Array<string>(C.GRID_COLS).fill("#"),
  ); // A connected lattice of long loops, mirrored across the trench.
  for (let y = 1; y <= 16; y++)
    for (let x = 1; x <= 34; x++)
      if (
        y === 1 ||
        y === 4 ||
        y === 11 ||
        y === 14 ||
        y === 16 ||
        x === 1 ||
        x === 5 ||
        x === 9 ||
        x === 13 ||
        x === 22 ||
        x === 26 ||
        x === 30 ||
        x === 34
      )
        a[y][x] = ".";
  // The tunnel bends down around the den approach.
  for (let x = 0; x < C.GRID_COLS; x++) a[4][x] = ".";
  for (let x = 14; x <= 21; x++) a[4][x] = "#";
  for (let x = 13; x <= 22; x++) a[5][x] = ".";
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) a[y][x] = "d";
  a[6][16] = "g";
  return a.map((r) => r.join(""));
}
export function initial(
  assets: Record<string, ImageBitmap[]> = {},
): FathomState {
  const tiles = maze();
  const s: FathomState = {
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted: false,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, " ")),
    visibility: tiles.map(() => "u".repeat(C.GRID_COLS)),
    forager: center(17, 14),
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    timer: 2,
    liveTime: 0,
    desired: "up",
    rng: 1739,
    pointerDown: {},
    assets,
  };
  return reconcile(s);
}
export function reconcile(s: FathomState): FathomState {
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - s.depth + 1);
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split(".").length - 1;
  [s.forager, ...s.drifters, ...s.predators].forEach(locate);
  for (const p of s.predators) {
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
  }
  return s;
}
export function screen(s: FathomState, v: Screen) {
  s.screen = v;
  s.menuIndex =
    v === "title"
      ? s.titleIndex
      : v === "paused" || v === "gameover"
        ? 0
        : null;
  if (v === "countdown" || v === "cleared") s.timer = 2;
  if (v === "playing" && s.liveTime === 0) s.liveTime = 0;
  return s;
}
export function begin(s: FathomState, title = false) {
  const n = initial(s.assets);
  n.muted = s.muted;
  n.titleIndex = s.titleIndex;
  n.simTime = s.simTime;
  n.remainder = s.remainder;
  return screen(n, title ? "title" : "countdown");
}
function attempt(s: FathomState) {
  s.forager = center(17, 14);
  s.predators = roster(s.depth);
  s.drifters = [];
  s.pulses = [];
  s.inkClouds = [];
  s.brightness = 0;
  s.brightHold = 0;
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.liveTime = 0;
  screen(s, "countdown");
}
export function line(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
  for (let i = 1; i < n; i++) {
    const x = Math.floor(
        (a.x + ((b.x - a.x) * i) / n - C.GRID_ORIGIN_X) / C.TILE,
      ),
      y = Math.floor((a.y + ((b.y - a.y) * i) / n - C.GRID_ORIGIN_Y) / C.TILE);
    if (
      x === Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE) &&
      y === Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE)
    )
      continue;
    if (tile(s, x, y) === "#") return false;
  }
  return true;
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
function blinded(s: FathomState, p: Predator) {
  return s.inkClouds.some((c) => {
    const f = s.forager,
      dx = f.x - p.x,
      dy = f.y - p.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((c.x - p.x) * dx + (c.y - p.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    return Math.hypot(p.x + dx * t - c.x, p.y + dy * t - c.y) <= c.radius;
  });
}
function acquire(s: FathomState, p: Predator, fresh = false) {
  if (p.state !== "chase" || fresh) {
    p.alertLeft = p.kind === "lanternjaw" ? 0 : C.ALERT_TIME;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.state = "chase";
  const map = distances(s, s.forager.tx, s.forager.ty);
  const reverse = opposite(p.dir);
  const reverseDistance = map.get(neighbor(s, p.tx, p.ty, reverse).join(","));
  const forwardDistance = map.get(neighbor(s, p.tx, p.ty, p.dir).join(","));
  if (
    reverseDistance !== undefined &&
    reverseDistance < (forwardDistance ?? Infinity)
  )
    p.dir = reverse;
  p.fix = [s.forager.tx, s.forager.ty];
  p.linger = C.LINGER_TIME;
  p.phase = 0;
  p.flaring = p.kind === "flarefish" ? false : null;
  p.flareCharging = p.kind === "flarefish" ? false : null;
}
export function cast(s: FathomState, owner = -1, tint: Pulse["tint"] = "cyan") {
  const b = owner < 0 ? s.forager : s.predators[owner];
  s.pulses.push({
    source: owner < 0 ? "forager" : "gloamfin",
    tint,
    ox: b.tx,
    oy: b.ty,
    front: -0.001,
    range: owner < 0 ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    caught: false,
  });
}
export function light(s: FathomState) {
  const flare = s.predators.filter((p) => p.flaring);
  s.visibility = s.visibility.map((r, y) =>
    [...r]
      .map((v, x) => {
        const c = center(x, y);
        return (distance(c, s.forager) <= s.visionRadius &&
          line(s, s.forager, c)) ||
          flare.some((p) => distance(p, c) <= C.FLARE_RADIUS)
          ? "l"
          : v === "u"
            ? "u"
            : "r";
      })
      .join(""),
  );
  const lit = (b: Body) =>
    (distance(b, s.forager) <= s.visionRadius && line(s, s.forager, b)) ||
    flare.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  for (const p of s.predators)
    p.lit = p.state !== "den" && (lit(p) || p.mark > 0 || p.alertLeft > 0);
  for (const d of s.drifters) d.lit = lit(d);
}
export function tick(s: FathomState, held: Direction[], events: Set<string>) {
  const dt = C.TICK_DT;
  s.simTime += dt;
  if (s.screen === "countdown") {
    s.timer -= dt;
    light(s);
    if (s.timer <= 1e-8) screen(s, "playing");
    return;
  }
  if (s.screen === "cleared") {
    s.timer -= dt;
    if (s.timer <= 1e-8) {
      const n = initial(s.assets);
      n.depth = s.depth + 1;
      n.score = s.score;
      n.lives = s.lives;
      n.simTime = s.simTime;
      n.titleIndex = s.titleIndex;
      n.muted = s.muted;
      n.predators = roster(n.depth);
      Object.assign(s, screen(n, "countdown"));
    }
    return;
  }
  if (s.screen !== "playing") return;
  s.liveTime += dt;
  s.sonar.cooldown = Math.max(0, s.sonar.cooldown - dt);
  s.ink.cooldown = Math.max(0, s.ink.cooldown - dt);
  if (s.brightHold > 0) s.brightHold = Math.max(0, s.brightHold - dt);
  else s.brightness *= 0.5 ** (dt / C.BRIGHT_HALFLIFE);
  const f = s.forager;
  if (held.length) {
    if (held.includes(s.desired) === false) s.desired = held[held.length - 1];
    if (s.desired === opposite(f.dir)) f.dir = s.desired;
    move(s, f, C.FORAGER_SPEED, false, () =>
      open(s, ...neighbor(s, f.tx, f.ty, s.desired)) ? s.desired : f.dir,
    );
  } else f.moving = false;
  if (s.plankton[f.ty]?.[f.tx] === ".") {
    replace(s.plankton, f.tx, f.ty, " ");
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    events.add(C.CUES.eat);
    reconcile(s);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      screen(s, "cleared");
      events.add(C.CUES.descend);
      return;
    }
  }
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: c.remaining - dt }))
    .filter((c) => c.remaining > 1e-8);
  for (let i = 0; i < s.predators.length; i++) {
    const p = s.predators[i];
    p.mark = Math.max(0, p.mark - dt);
    p.alertLeft = Math.max(0, p.alertLeft - dt);
    p.alert = p.alertLeft > 0;
    if (!p.mind) continue;
    if (p.slot !== null && s.liveTime + 1e-8 >= p.slot * C.DEN_RELEASE_GAP)
      p.released = true;
    if (p.state === "den") {
      const gate = s.tiles
        .flatMap((r, y) =>
          [...r].map((c, x) =>
            c === "g" ? ([x, y] as [number, number]) : null,
          ),
        )
        .find((v) => v !== null);
      if (
        p.released &&
        gate &&
        s.tiles.some((r) => r.includes("d")) &&
        p.travel
      ) {
        let target: [number, number] = gate;
        const exit = dirs
          .map((d) => neighbor(s, ...gate, d))
          .find(([x, y]) => tile(s, x, y) === ".");
        if (exit) target = exit;
        move(s, p, p.speed, true, () => route(s, p, target, true));
        if (tile(s, p.tx, p.ty) === ".") p.state = "wander";
      }
      continue;
    }
    const heard = p.kind === "gloamfin" && distance(p, f) <= C.GLOAMFIN_HEAR;
    const blind = p.kind !== "gloamfin" && blinded(s, p);
    const sees =
      p.kind !== "gloamfin" &&
      !blind &&
      distance(p, f) <= (p.detectRange ?? 0) &&
      line(s, p, f);
    if (p.kind === "gloamfin") p.hearingLock = heard;
    if (
      heard ||
      sees ||
      (p.flaring && !blind && distance(p, f) <= C.FLARE_RADIUS)
    )
      acquire(s, p);
    else if (blind) {
      p.state = "wander";
      p.fix = null;
      p.flare = C.FLARE_INTERVAL;
    } else if (p.state === "chase" && p.kind !== "gloamfin") {
      p.linger -= dt;
      if (p.linger <= 0) {
        p.state = "wander";
        p.fix = null;
        p.flare = C.FLARE_INTERVAL;
      }
    }
    if (p.kind === "gloamfin") {
      p.ping -= dt;
      if (
        p.state === "chase" &&
        !heard &&
        p.fix &&
        p.tx === p.fix[0] &&
        p.ty === p.fix[1]
      ) {
        p.state = "search";
        p.search = 0;
        p.searchPing = false;
      }
      if (p.state === "search") {
        p.search += dt;
        if (p.search >= C.GLOAMFIN_GIVEUP) {
          p.state = "wander";
          p.fix = null;
        }
      }
      const guaranteed =
        p.state === "search" &&
        p.search >= C.GLOAMFIN_SEARCH_DELAY &&
        !p.searchPing;
      if (
        !heard &&
        (p.ping <= 0 || guaranteed) &&
        s.liveTime - p.lastPing >= C.GLOAMFIN_PING_MIN_GAP
      ) {
        cast(s, i, guaranteed ? "orange" : "violet");
        if (guaranteed) p.searchPing = true;
        p.ping = C.GLOAMFIN_PING_INTERVAL;
        p.lastPing = s.liveTime;
        events.add(C.CUES.predatorPing);
      }
      p.chaseSpeed = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.chaseSpeed +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * dt) /
            C.GLOAMFIN_RAMP_TIME,
      );
    }
    if (p.kind === "flarefish") {
      if (p.state === "wander") {
        if (p.phase === 0) {
          p.flare -= dt;
          if (p.flare <= 0) {
            p.phase = C.FLARE_CHARGE + C.FLARE_BLOOM;
            p.flareCharging = true;
          }
        } else {
          const prev = p.phase;
          p.phase = Math.max(0, p.phase - dt);
          p.flareCharging = p.phase > C.FLARE_BLOOM;
          p.flaring = p.phase > 0 && p.phase <= C.FLARE_BLOOM;
          if (prev > C.FLARE_BLOOM && p.phase <= C.FLARE_BLOOM)
            events.add(C.CUES.flare);
          if (p.phase === 0) p.flare = C.FLARE_INTERVAL;
        }
      } else {
        p.flareCharging = false;
        p.flaring = false;
        p.phase = 0;
      }
      p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
    }
    reconcile(s);
    if (p.travel)
      move(s, p, p.speed, false, () => {
        const old = p.dir;
        let target = p.state === "chase" ? p.fix : null;
        if (
          p.state === "search" &&
          p.fix &&
          Math.abs(p.tx - p.fix[0]) + Math.abs(p.ty - p.fix[1]) >
            C.GLOAMFIN_SEARCH_ROAM
        )
          target = p.fix;
        const d = route(s, p, target, false);
        if (
          d &&
          p.kind === "gloamfin" &&
          p.state === "chase" &&
          d !== old &&
          d !== opposite(old)
        )
          p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
        return d;
      });
  }
  for (const pulse of s.pulses) {
    const before = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * dt;
    const map = distances(s, pulse.ox, pulse.oy, true);
    const reached = (b: { tx: number; ty: number }) => {
      const n = map.get(`${b.tx},${b.ty}`);
      return (
        n !== undefined && n > before && n <= pulse.front && n <= pulse.range
      );
    };
    if (pulse.source === "forager") {
      for (const [k, n] of map)
        if (n > before && n <= pulse.front && n <= pulse.range) {
          const [x, y] = k.split(",").map(Number);
          replace(s.visibility, x, y, "r");
          for (const d of dirs) {
            const [nx, ny] = neighbor(s, x, y, d);
            if (
              tile(s, nx, ny) === "#" &&
              nx >= 0 &&
              nx < C.GRID_COLS &&
              ny >= 0 &&
              ny < C.GRID_ROWS
            )
              replace(s.visibility, nx, ny, "r");
          }
        }
      for (const p of s.predators)
        if (p.state !== "den" && reached(p)) {
          if (p.kind !== "lanternjaw") p.mark = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) acquire(s, p, true);
        }
    } else if (!pulse.caught && reached(f)) {
      const p = s.predators[pulse.owner];
      if (p?.mind) {
        acquire(s, p, true);
        pulse.caught = true;
      }
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
  s.drifterIn = Math.max(0, s.drifterIn - dt);
  if (
    s.drifterIn <= 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const gate = s.tiles
      .flatMap((r, y) =>
        [...r].map((c, x) => (c === "g" ? ([x, y] as [number, number]) : null)),
      )
      .find((v) => v !== null);
    if (gate) {
      const exit = dirs
        .map((d) => neighbor(s, ...gate, d))
        .find(([x, y]) => tile(s, x, y) === ".");
      if (exit)
        s.drifters.push({
          ...center(...exit),
          lit: false,
          mind: true,
          travel: true,
        });
    }
    s.drifterIn = C.DRIFTER_INTERVAL;
  }
  for (const d of s.drifters)
    if (d.mind && d.travel)
      move(s, d, C.DRIFTER_SPEED, false, () => route(s, d, null, false));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  if (
    s.predators.some((p) => p.state !== "den" && p.tx === f.tx && p.ty === f.ty)
  ) {
    events.add(C.CUES.caught);
    if (s.lives === 0) screen(s, "gameover");
    else {
      s.lives--;
      attempt(s);
    }
  }
  reconcile(s);
  light(s);
  for (const p of s.predators) p.alert = p.alertLeft > 0;
}
export function items(s: ReadState): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function rect(s: ReadState, i: number) {
  return i >= 0 && i < items(s).length
    ? { x: 480, y: 430 + i * 66, w: 320, h: 52 }
    : null;
}
import { debug } from "./debug";
export type FathomDebugApi = typeof debug;
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        freq: [720, 360, 95, 210, 80, 150, 440][i],
        freqTo: [980, 120, 45, 480, 900, 40, 880][i],
        durationMs: [55, 400, 300, 280, 500, 600, 700][i],
        gain: 0.12,
        wave: i === 2 ? "triangle" : "sine",
      }),
    );
    const assets: Record<string, ImageBitmap[]> = {};
    await Promise.all(
      Object.entries({
        glimmerfin: 8,
        lanternjaw: 16,
        gloamfin: 8,
        flarefish: 8,
        drifter: 8,
        "flare-bloom": 8,
        "trench-walls": 19,
      }).map(async ([name, count]) => {
        assets[name] = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            api.assets.loadImage(`${name}/${i}.png`),
          ),
        );
      }),
    );
    for (const name of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(name, (s) => s[name]);
    api.diagnostics.register("sonar", (s) => s.sonar.cooldown);
    api.diagnostics.register("ink", (s) => s.ink.cooldown);
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.ROSTER_CAP * C.DEN_ORDER.length; i++)
      api.diagnostics.register(`predator ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "none";
      });
    return [initial(assets), debug];
  },
  update(state, api, dt) {
    let s = clone(state);
    const pressed = (a: string) => api.input.pressed(a);
    if (pressed("mute")) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    let confirm = false;
    for (const sample of api.input.pointerSamples()) {
      const hit = items(s).findIndex((_, i) => {
        const r = rect(s, i)!;
        return (
          sample.x >= r.x &&
          sample.x <= r.x + r.w &&
          sample.y >= r.y &&
          sample.y <= r.y + r.h
        );
      });
      if (sample.type === "move" && sample.device !== "touch" && hit >= 0)
        s.menuIndex = hit;
      if (sample.type === "down") {
        s.pointerDown[sample.id] = s.screen === "howto" ? -2 : hit;
        if (hit >= 0) s.menuIndex = hit;
      }
      if (sample.type === "up") {
        if (s.pointerDown[sample.id] === hit && hit >= 0) {
          s.menuIndex = hit;
          confirm = true;
        }
        if (s.screen === "howto" && s.pointerDown[sample.id] === -2)
          confirm = true;
        delete s.pointerDown[sample.id];
      }
    }
    const held = dirs.filter((d) => api.input.value(d) > 0);
    const events = new Set<string>();
    if (s.screen === "playing") {
      if (pressed("pause")) screen(s, "paused");
      else {
        for (const d of held) if (d !== s.desired) s.desired = d;
        if (pressed("a") && s.sonar.ready) {
          cast(s);
          s.sonar.cooldown = C.SONAR_COOLDOWN;
          events.add(C.CUES.sonar);
        }
        if (pressed("b") && s.ink.ready) {
          s.inkClouds.push({
            x: s.forager.x,
            y: s.forager.y,
            radius: C.INK_RADIUS,
            remaining: C.INK_LIFE,
          });
          s.ink.cooldown = C.INK_COOLDOWN;
          events.add(C.CUES.ink);
        }
      }
    } else if (s.screen === "paused" && (pressed("pause") || pressed("back")))
      screen(s, "playing");
    else if (s.screen === "howto") {
      if (confirm || pressed("confirm") || pressed("back")) s = begin(s, true);
    } else if (items(s).length) {
      const n = items(s).length;
      if (pressed("up")) s.menuIndex = ((s.menuIndex ?? 0) + n - 1) % n;
      if (pressed("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % n;
      if (s.screen === "gameover" && pressed("back")) s = begin(s, true);
      else if (confirm || pressed("confirm")) {
        const i = s.menuIndex;
        if (s.screen === "title") {
          s.titleIndex = i ?? 0;
          s = i === 0 ? begin(s) : screen(s, "howto");
        } else if (s.screen === "paused")
          s = i === 0 ? screen(s, "playing") : begin(s, i === 2);
        else s = begin(s, i === 1);
      }
    }
    s.remainder += dt;
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder -= C.TICK_DT;
      const cues = new Set<string>();
      tick(s, held, cues);
      for (const c of cues) api.audio.play(c);
    }
    for (const e of events) api.audio.play(e);
    return reconcile(s);
  },
  render: draw,
};
