import type { RenderApi } from "@clockwyrks/simple-2d";
import { center, distances, items, rect } from "./game";
import type { ReadState, Direction } from "./game";
import * as C from "./constants";
const cyan = "#83f9ed",
  dim = "#64828d",
  amber = "#ff9d59";
export function draw(s: ReadState, { ctx: c }: RenderApi) {
  c.imageSmoothingEnabled = false;
  const text = (
    t: string,
    x: number,
    y: number,
    size = 16,
    color = cyan,
    align: CanvasTextAlign = "left",
  ) => {
    c.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(t, x, y);
  };
  const glow = (x: number, y: number, r: number, color: string) => {
    c.save();
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  };
  const sprite = (
    sheet: string,
    frame: number,
    x: number,
    y: number,
    size = C.TILE,
  ) => {
    const a = s.assets[sheet]?.[frame];
    if (a)
      c.drawImage(a as ImageBitmap, x - size / 2, y - size / 2, size, size);
  };
  const circle = (x: number, y: number, r: number) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
  };
  const facing = (d: Direction) => ({ down: 0, up: 2, left: 4, right: 6 })[d];
  const terrain = (x: number, y: number, full = false) => {
    const v = s.visibility[y][x],
      t = s.tiles[y][x];
    const b = center(x, y);
    let f = 16;
    if (t === "#") {
      f = 0;
      for (const [dx, dy, bit] of [
        [0, -1, 1],
        [1, 0, 2],
        [0, 1, 4],
        [-1, 0, 8],
      ])
        if (s.tiles[y + dy]?.[x + dx] === "#") f += bit;
    }
    if (t === "g") f = 18;
    c.globalAlpha = full || v === "l" ? 1 : v === "r" ? 0.26 : 1;
    sprite("trench-walls", v === "u" && !full ? 17 : f, b.x, b.y);
    if (s.plankton[y][x] === "." && (v !== "u" || full)) {
      c.fillStyle = cyan;
      c.shadowBlur = 10;
      c.shadowColor = cyan;
      circle(b.x, b.y, C.PLANKTON_DOT / 2);
      c.fill();
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
  };
  const maze = ["playing", "countdown", "paused", "cleared"].includes(s.screen);
  if (maze) {
    c.fillStyle = "#03090f";
    c.fillRect(
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
    c.save();
    circle(s.forager.x, s.forager.y, s.windowRadius);
    c.clip();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) terrain(x, y);
    glow(s.forager.x, s.forager.y, s.windowRadius, "#12525635");
    for (const b of [
      ...s.drifters,
      ...s.predators.filter(
        (p) => p.kind === "lanternjaw" && p.state !== "den",
      ),
    ]) {
      glow(b.x, b.y, 15, "#ff7e384f");
      circle(b.x, b.y, 3);
      c.fillStyle = amber;
      c.fill();
    }
    c.restore();
    for (const p of s.predators.filter((p) => p.flaring)) {
      c.save();
      circle(p.x, p.y, C.FLARE_RADIUS);
      c.clip();
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++) terrain(x, y, true);
      c.restore();
    }
    for (const cloud of s.inkClouds)
      glow(cloud.x, cloud.y, cloud.radius, "#000009ef");
    for (const pulse of s.pulses) {
      const map = distances(s, pulse.ox, pulse.oy, true);
      c.save();
      c.strokeStyle =
        pulse.tint === "cyan"
          ? cyan
          : pulse.tint === "violet"
            ? "#bb8eff"
            : "#ffac60";
      c.shadowColor = c.strokeStyle;
      c.shadowBlur = 12;
      c.lineWidth = 3;
      for (const [k, n] of map) {
        const age = pulse.front - n;
        if (age < 0 || age > 1.4) continue;
        const [x, y] = k.split(",").map(Number),
          b = center(x, y);
        c.globalAlpha = 1 - age / 1.4;
        c.strokeRect(b.x - 12, b.y - 12, 24, 24);
      }
      c.restore();
    }
    for (const d of s.drifters)
      if (d.lit) sprite("drifter", Math.floor(s.simTime * 8) % 8, d.x, d.y);
    for (const p of s.predators) {
      if (p.lit) {
        const f =
          p.kind === "lanternjaw" && p.state === "wander"
            ? 8 + (Math.floor(s.simTime * 8) % 8)
            : facing(p.dir) + (Math.floor(s.simTime * 7) % 2);
        sprite(p.kind, f, p.x, p.y);
      }
      if (p.alert) {
        c.save();
        c.strokeStyle = p.kind === "gloamfin" ? "#c59bff" : "#ffac60";
        c.lineWidth = 2;
        const r = 18 + (1 - p.alertLeft / C.ALERT_TIME) * 30;
        circle(p.x, p.y, r);
        c.stroke();
        text("!", p.x, p.y - 25, 24, c.strokeStyle, "center");
        c.restore();
      }
      if (p.flareCharging || p.flaring) {
        const frame = p.flareCharging
          ? Math.min(
              2,
              Math.floor(
                ((C.FLARE_CHARGE + C.FLARE_BLOOM - p.phase) / C.FLARE_CHARGE) *
                  3,
              ),
            )
          : 3 +
            Math.min(
              2,
              Math.floor(((C.FLARE_BLOOM - p.phase) / C.FLARE_BLOOM) * 3),
            );
        sprite("flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
      }
    }
    glow(s.forager.x, s.forager.y, 40, "#62ffe850");
    sprite(
      "glimmerfin",
      facing(s.forager.dir) +
        (s.forager.moving ? Math.floor(s.simTime * 9) % 2 : 0),
      s.forager.x,
      s.forager.y,
    );
    c.strokeStyle = "#17333d";
    c.lineWidth = 1;
    c.strokeRect(64, 80, 1152, 576);
    text("F A T H O M", 64, 40, 18);
    text(C.DIVE_LABEL, 1216, 41, 13, dim, "right");
    text(String(s.score).padStart(6, "0"), 640, 57, 48, cyan, "center");
    text(`DEPTH ${String(s.depth).padStart(2, "0")}`, 64, 693, 16);
    for (let i = 0; i < s.lives; i++)
      sprite("glimmerfin", 6, 220 + i * 28, 688, 24);
    for (const [label, x, value] of [
      ["SONAR  [SPACE]", 525, 1 - s.sonar.cooldown / C.SONAR_COOLDOWN],
      ["INK  [SHIFT]", 835, 1 - s.ink.cooldown / C.INK_COOLDOWN],
    ] as const) {
      text(label, x, 685, 12, dim);
      c.fillStyle = "#112a32";
      c.fillRect(x, 697, 220, 3);
      c.fillStyle = cyan;
      c.fillRect(x, 697, 220 * Math.max(0, value), 3);
    }
    text("P / ESC  PAUSE", 1216, 691, 11, dim, "right");
  }
  if (!maze) {
    // An engraved sonar chart gives the title its own quiet deep-water identity.
    for (let i = 0; i < 7; i++) {
      c.strokeStyle = `rgba(53,125,137,${0.13 - i * 0.012})`;
      circle(640, 325, 110 + i * 52);
      c.stroke();
    }
    c.strokeStyle = "#102a35";
    for (let x = 80; x < 1280; x += 80) {
      c.beginPath();
      c.moveTo(x, 80);
      c.lineTo(x, 640);
      c.stroke();
    }
    for (let y = 80; y < 660; y += 80) {
      c.beginPath();
      c.moveTo(64, y);
      c.lineTo(1216, y);
      c.stroke();
    }
    text("BATHYMETRIC EXPEDITION  /  001", 64, 48, 12, dim);
    text("ABYSSAL ZONE", 1216, 48, 12, dim, "right");
    text("36° N   /   018° E", 64, 684, 12, dim);
    text("M  SOUND     `  DIAGNOSTICS", 1216, 684, 12, dim, "right");
  }
  if (s.screen === "title") {
    glow(640, 280, 260, "#0f555c38");
    text("↓  DESCEND INTO THE UNKNOWN", 640, 168, 12, dim, "center");
    c.save();
    c.shadowBlur = 28;
    c.shadowColor = "#5ef5e06a";
    text(C.TITLE_TEXT, 640, 303, 112, "#d7fff4", "center");
    c.restore();
    text(C.TAGLINE_TEXT.split("").join(" "), 640, 350, 16, cyan, "center");
    sprite("glimmerfin", 6, 640, 393, 32);
    text("Eat to see. Glow to be hunted.", 640, 621, 14, dim, "center");
  }
  if (s.screen === "howto") {
    text("FIELD GUIDE", 128, 127, 14, dim);
    text("Learn the dark.", 128, 186, 42, "#d7fff4");
    const rows = [
      [
        "01  FIND YOUR WAY",
        "WASD / ARROWS swim. Eat plankton to grow your light.",
      ],
      [
        "02  SOUND THE TRENCH",
        "SPACE sends sonar around corners. SHIFT drops blinding ink.",
      ],
      [
        "03  KNOW THE HUNTERS",
        "Lanternjaw follows light, disguised as an amber drifter.",
      ],
      ["", "Gloamfin hears you. Its violet ping can give you away."],
      ["", "Flarefish sees light and burns the dark with a flare."],
      [
        "04  GO DEEPER",
        "Clear every mote to descend. P / ESC pauses; M mutes.",
      ],
    ];
    rows.forEach(([a, b], i) => {
      text(a, 128, 250 + i * 53, 12, cyan);
      text(b, 128, 273 + i * 53, 16, "#b0c7cb");
    });
    text(
      "Your light reveals. Sonar remembers. Beyond your circle: darkness.",
      128,
      604,
      14,
      dim,
    );
    text("ENTER / ESC / CLICK  →  RETURN", 128, 650, 13, cyan);
  }
  if (
    s.screen === "paused" ||
    s.screen === "cleared" ||
    s.screen === "countdown"
  ) {
    c.fillStyle = "#020a12b8";
    c.fillRect(340, 215, 600, s.screen === "paused" ? 440 : 265);
    text(
      s.screen === "paused"
        ? "DIVE SUSPENDED"
        : s.screen === "cleared"
          ? `DEPTH ${s.depth} CLEARED`
          : "DIVE",
      640,
      318,
      36,
      "#d7fff4",
      "center",
    );
    text(
      s.screen === "paused"
        ? "The trench can wait."
        : s.screen === "cleared"
          ? `+${C.SCORE_CLEAR}  /  DESCENDING`
          : `${Math.max(1, Math.ceil(s.timer))}   /   FIND YOUR LIGHT`,
      640,
      369,
      14,
      dim,
      "center",
    );
  }
  if (s.screen === "gameover") {
    text("SIGNAL LOST", 640, 235, 56, "#d7fff4", "center");
    text(
      `${s.score} POINTS   /   DEPTH ${s.depth}`,
      640,
      321,
      20,
      cyan,
      "center",
    );
    text("Every light leaves an echo.", 640, 370, 14, dim, "center");
  }
  items(s).forEach((item, i) => {
    const r = rect(s, i)!;
    const selected = s.menuIndex === i;
    c.fillStyle = selected ? "#13363d" : "#07151e";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = selected ? "#65c8bd" : "#1a3540";
    c.strokeRect(r.x, r.y, r.w, r.h);
    if (selected) {
      c.fillStyle = cyan;
      c.fillRect(r.x, r.y, 3, r.h);
    }
    text(item, r.x + 30, r.y + 33, 18, selected ? "#d7fff4" : dim);
    if (selected) text("→", r.x + r.w - 25, r.y + 33, 18, cyan, "right");
  });
  if (s.muted) text("SOUND OFF", 1216, 65, 10, dim, "right");
}
