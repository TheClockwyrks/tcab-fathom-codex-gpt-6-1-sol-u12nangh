import { describe, it, expect } from "vitest";
import { initial, distances, neighbor, dirs, tick, clone, game } from "./game";
import { debug } from "./debug";
import * as C from "./constants";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { createCanvas } from "@napi-rs/canvas";
const advance = (s: ReturnType<typeof initial>, n: number) => {
  for (let i = 0; i < n; i++) tick(s, [], new Set());
  return s;
};
describe("trench layout", () => {
  it("is connected, symmetric, narrow and has no dead ends", () => {
    const s = initial();
    const map = distances(s, s.forager.tx, s.forager.ty);
    let count = 0,
      sum = 0;
    const degree = new Map<string, number>();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = s.tiles[y][x];
        if (!"dg".includes(t) && !"dg".includes(s.tiles[y][35 - x]))
          expect(t).toBe(s.tiles[y][35 - x]);
        if (t !== ".") continue;
        count++;
        expect(map.has(`${x},${y}`)).toBe(true);
        const n = dirs.filter((d) => {
          const [a, b] = neighbor(s, x, y, d);
          return s.tiles[b]?.[a] === ".";
        }).length;
        expect(n).toBeGreaterThanOrEqual(2);
        sum += n;
        degree.set(`${x},${y}`, n);
        expect(
          s.tiles[y][x + 1] === "." &&
            s.tiles[y + 1]?.[x] === "." &&
            s.tiles[y + 1]?.[x + 1] === ".",
        ).toBe(false);
      }
    expect(count / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(sum / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const visited = new Set<string>();
    const runs: number[] = [];
    for (const [k, d] of degree) {
      if (d !== 2 || visited.has(k)) continue;
      const q = [k];
      visited.add(k);
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i].split(",").map(Number);
        for (const dir of dirs) {
          const key = neighbor(s, x, y, dir).join(",");
          if (degree.get(key) === 2 && !visited.has(key)) {
            visited.add(key);
            q.push(key);
          }
        }
      }
      runs.push(q.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
});
describe("simulation and poses", () => {
  it("keeps poses immutable and reconcile inert", () => {
    const s = initial();
    const n = debug.setBrightness(s, 1);
    expect(s.brightness).toBe(0);
    expect(n.windowRadius).toBe(C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN);
    const fog = debug.clearFog(n);
    expect(debug.reconcile(fog)).toEqual(fog);
    expect(() => debug.setLives(s, -1)).toThrow();
    expect(() => debug.setMaze(s, ["bad"])).toThrow();
  });
  it("eats, holds brightness, remembers fog and freezes paused worlds", () => {
    let s = debug.clearPredators(debug.setScreen(initial(), "playing"));
    advance(s, 1);
    expect(s.score).toBe(C.SCORE_PLANKTON);
    expect(s.brightness).toBe(C.BRIGHT_PER_EAT);
    expect(s.visibility.join("")).toContain("l");
    advance(s, 250);
    expect(s.brightness).toBeLessThan(C.BRIGHT_PER_EAT);
    s = debug.setScreen(s, "paused");
    const before = clone(s);
    advance(s, 120);
    expect(s.forager).toEqual(before.forager);
    expect(s.brightness).toBe(before.brightness);
    expect(s.simTime).toBeCloseTo(before.simTime + 1);
  });
  it("scores the final mote, clears and descends", () => {
    let s = debug.clearPredators(debug.clearPlankton(initial()));
    s = debug.setPlankton(s, s.forager.tx, s.forager.ty, true);
    s = debug.setScreen(s, "playing");
    advance(s, 1);
    expect(s.screen).toBe("cleared");
    expect(s.score).toBe(C.SCORE_CLEAR + C.SCORE_PLANKTON);
    advance(s, 241);
    expect(s.depth).toBe(2);
    expect(s.screen).toBe("countdown");
    expect(s.predators).toHaveLength(4);
  });
  it("contact uses reserve lives even with a frozen mind", () => {
    let s = debug.clearPredators(initial());
    s = debug.addPredator(s, "lanternjaw", s.forager.tx, s.forager.ty);
    s = debug.setPredatorMind(s, 0, false);
    s = debug.setLives(s, 0);
    s = debug.setScreen(s, "playing");
    advance(s, 1);
    expect(s.screen).toBe("gameover");
  });
  it("distinguishes hearing through rock from ink-blinded light senses", () => {
    let s = debug.clearPredators(debug.clearPlankton(initial()));
    s = debug.setForagerTile(s, 5, 11);
    s = debug.addPredator(s, "gloamfin", 5, 14);
    s = debug.setPredatorTravel(s, 0, false);
    s = debug.setScreen(s, "playing");
    advance(s, 1);
    expect(s.predators[0].state).toBe("wander");
    s = debug.setForagerTile(s, 5, 13);
    advance(s, 1);
    expect(s.predators[0].hearingLock).toBe(true);
    expect(s.predators[0].alert).toBe(true);
  });
});
it("runs through the real engine with a counted clock and engine-loaded assets", async () => {
  const canvas = createCanvas(1280, 720);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => target,
    },
  });
  const oldFetch = globalThis.fetch,
    oldBitmap = globalThis.createImageBitmap;
  globalThis.fetch = async () => new Response(new Blob());
  globalThis.createImageBitmap = async () =>
    createCanvas(32, 32) as unknown as ImageBitmap;
  try {
    await engine.initialize();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    await engine.advance(60);
    expect(engine.state.simTime).toBeCloseTo(1);
    expect(engine.state.score).toBeGreaterThan(0);
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
  } finally {
    engine.destroy();
    globalThis.fetch = oldFetch;
    globalThis.createImageBitmap = oldBitmap;
  }
});

it("honors release slots while travel is disabled", () => {
  const s = debug.setScreen(initial(), "playing");
  s.predators.forEach((p) => {
    p.travel = false;
  });
  advance(s, 1);
  expect(s.predators[0].released).toBe(true);
  expect(s.predators[1].released).toBe(false);
  advance(s, 600);
  expect(s.predators[1].released).toBe(true);
  expect(s.predators[1].state).toBe("den");
});
it("admits drifters on cadence and preserves fog across a lost life", () => {
  let s = debug.setScreen(initial(), "playing");
  s = debug.clearPredators(s);
  s = debug.setDrifterIn(s, 0);
  advance(s, 1);
  expect(s.drifters).toHaveLength(1);
  const revealed = s.visibility.join("").replace(/l/g, "r");
  s = debug.addPredator(s, "lanternjaw", s.forager.tx, s.forager.ty);
  s = debug.setPredatorMind(s, 0, false);
  advance(s, 1);
  expect(s.lives).toBe(C.START_LIVES - 1);
  expect(s.screen).toBe("countdown");
  expect(s.drifters).toHaveLength(0);
  expect(s.visibility.join("").replace(/l/g, "r")).toBe(revealed);
});
it("reset restores all run state while preserving mute and assets", () => {
  let s = initial();
  s.muted = true;
  s = debug.setDepth(s, 9);
  s = debug.setScore(s, 1234);
  s = debug.setTitleIndex(s, 1);
  const n = debug.reset(s);
  expect(n).toEqual({ ...initial(), muted: true });
});
