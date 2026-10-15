import {
  initial,
  clone,
  reconcile,
  screen,
  items,
  rect,
  center,
  makePred,
  roster,
  replace,
  tile,
} from "./game";
import type { ReadState, FathomState, Direction, Screen } from "./game";
import * as C from "./constants";
function valid(ok: boolean): asserts ok {
  if (!ok) throw new RangeError("Invalid Fathom pose");
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function cell(s: ReadState, x: number, y: number, pred = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  valid(pred ? ".dg".includes(tile(s, x, y)) : tile(s, x, y) === ".");
}
function pose(s: ReadState, fn: (n: FathomState) => void) {
  const n = clone(s);
  fn(n);
  return reconcile(n);
}
function predator(s: FathomState, i: number) {
  number(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drifter(s: FathomState, i: number) {
  number(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
function direction(d: Direction) {
  valid(["up", "down", "left", "right"].includes(d));
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) => ({
    ...initial(s.assets as Record<string, ImageBitmap[]>),
    muted: s.muted,
  }),
  snapshot: (s: ReadState) => {
    const {
      assets: _assets,
      remainder: _remainder,
      timer: _timer,
      liveTime: _liveTime,
      desired: _desired,
      rng: _rng,
      pointerDown: _pointerDown,
      ...n
    } = clone(s);
    return {
      ...n,
      forager: { ...n.forager },
      drifters: n.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: n.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: n.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
    };
  },
  reconcile: (s: ReadState) => reconcile(clone(s)),
  setScreen: (s: ReadState, v: Screen) =>
    pose(s, (n) => {
      valid(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(v),
      );
      if (v === "playing" && n.screen !== "paused") n.liveTime = 0;
      screen(n, v);
    }),
  setMenuIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, items(n).length - 1, true);
      n.menuIndex = i;
    }),
  setTitleIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = i;
    }),
  menuItemRect: rect,
  setScore: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.score = v;
    }),
  setLives: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.lives = v;
    }),
  setDepth: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 1, Infinity, true);
      n.depth = v;
      n.predators = roster(v);
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      valid(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.dg]+$/.test(r)),
      );
      const g = rows.join("").split("g").length - 1;
      valid(!rows.some((r) => /[dg]/.test(r)) || g === 1);
      n.tiles = [...rows];
    }),
  setPlankton: (s: ReadState, x: number, y: number, present: boolean) =>
    pose(s, (n) => {
      cell(n, x, y);
      valid(typeof present === "boolean");
      replace(n.plankton, x, y, present ? "." : " ");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = n.plankton.map((r) => " ".repeat(r.length));
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = n.visibility.map((r) => "u".repeat(r.length));
    }),
  setForagerTile: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      cell(n, x, y);
      n.forager = { ...center(x, y), dir: n.forager.dir };
    }),
  setForagerDir: (s: ReadState, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    }),
  setBrightness: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, 1);
      n.brightness = v;
    }),
  setBrightHold: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.BRIGHT_HOLD);
      n.brightHold = v;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, k: C.PredatorKind, x: number, y: number) =>
    pose(s, (n) => {
      valid(C.DEN_ORDER.includes(k));
      cell(n, x, y);
      n.predators.push(makePred(k, x, y, null));
    }),
  setPredatorTile: (s: ReadState, i: number, x: number, y: number) =>
    pose(s, (n) => {
      cell(n, x, y, true);
      Object.assign(predator(n, i), {
        ...center(x, y),
        dir: predator(n, i).dir,
      });
    }),
  setPredatorDir: (s: ReadState, i: number, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      predator(n, i).dir = d;
    }),
  setPredatorState: (s: ReadState, i: number, v: "den" | "wander" | "chase") =>
    pose(s, (n) => {
      valid(["den", "wander", "chase"].includes(v));
      const p = predator(n, i);
      valid(
        v === "den"
          ? "dg".includes(tile(n, p.tx, p.ty))
          : tile(n, p.tx, p.ty) === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? [n.forager.tx, n.forager.ty] : null;
      p.linger = C.LINGER_TIME;
    }),
  setPredatorReleased: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      predator(n, i).released = v;
    }),
  setPredatorMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      predator(n, i).mind = v;
    }),
  setPredatorTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      predator(n, i).travel = v;
    }),
  spawnDrifter: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      cell(n, x, y);
      n.drifters.push({
        ...center(x, y),
        lit: false,
        mind: true,
        travel: true,
      });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      drifter(n, i).mind = v;
    }),
  setDrifterTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      drifter(n, i).travel = v;
    }),
  setDrifterIn: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = v;
    }),
  setSonarCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.sonar.cooldown = v;
    }),
  setInkCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.ink.cooldown = v;
    }),
};
