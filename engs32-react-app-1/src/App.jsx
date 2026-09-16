import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ---------------- Theme ----------------
const COLORS = {
  bg: "#0F2419",
  panel: "#17392B",
  panelAlt: "#1E4433",
  line: "#2C5744",
  copper: "#C97C3D",
  copperBright: "#E39A5C",
  teal: "#5FA8A0",
  cream: "#EDE6D6",
  muted: "#8FA89C",
  amber: "#E8B34D",
  alert: "#D96C4D",
  wireOff: "#3A5B4C",
  wireOn: "#5FA8A0",
};

const HISTORY_KEY = "circuit-breaker-runs";

// ---------------- Graph templates ----------------
const GRAPH_2R = {
  viewBox: "0 0 420 220",
  nodes: {
    IN: { x: 20, y: 110, terminal: "in" },
    R1a: { x: 130, y: 40 },
    R1b: { x: 290, y: 40 },
    R2a: { x: 130, y: 180 },
    R2b: { x: 290, y: 180 },
    OUT: { x: 400, y: 110, terminal: "out" },
  },
  edges: [
    { id: "wA", a: "IN", b: "R1a", kind: "wire" },
    { id: "wB", a: "IN", b: "R2a", kind: "wire" },
    { id: "slotTop", a: "R1a", b: "R1b", kind: "slot" },
    { id: "slotBottom", a: "R2a", b: "R2b", kind: "slot" },
    { id: "wC", a: "R1b", b: "OUT", kind: "wire" },
    { id: "wD", a: "R2b", b: "OUT", kind: "wire" },
    { id: "wE", a: "R1b", b: "R2a", kind: "wire", dashed: true },
  ],
};

const GRAPH_3R = {
  viewBox: "0 0 500 220",
  nodes: {
    IN: { x: 20, y: 110, terminal: "in" },
    R1a: { x: 110, y: 40 },
    R1b: { x: 230, y: 40 },
    R2a: { x: 110, y: 180 },
    R2b: { x: 230, y: 180 },
    R3a: { x: 300, y: 110 },
    R3b: { x: 400, y: 110 },
    OUT: { x: 480, y: 110, terminal: "out" },
  },
  edges: [
    { id: "wA", a: "IN", b: "R1a", kind: "wire" },
    { id: "wB", a: "IN", b: "R2a", kind: "wire" },
    { id: "slotTop", a: "R1a", b: "R1b", kind: "slot" },
    { id: "slotBottom", a: "R2a", b: "R2b", kind: "slot" },
    { id: "wC", a: "R1b", b: "R3a", kind: "wire" },
    { id: "wD", a: "R2b", b: "R3a", kind: "wire" },
    { id: "wE", a: "R1b", b: "R2a", kind: "wire", dashed: true },
    { id: "slotMid", a: "R3a", b: "R3b", kind: "slot" },
    { id: "wF", a: "R3b", b: "OUT", kind: "fixed" },
  ],
};

// ---------------- Level generator ----------------
// Same 9 puzzle "shapes" as before, but with fresh numbers each time.
// A brute-force safety check rejects any generated set where a decoy,
// or a simpler shortcut, could accidentally also hit the target.

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function randEven(min, max) {
  let v = randInt(min, max);
  if (v % 2 !== 0) v += 1;
  return Math.min(v, max % 2 === 0 ? max : max - 1);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const TOL = 0.03;

// All resistances reachable from a 3-value tray on GRAPH_2R:
// any single value alone, or any pair in series, or any pair in parallel.
function reachable2R(vals) {
  const out = [...vals];
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      out.push(vals[i] + vals[j]);
      out.push((vals[i] * vals[j]) / (vals[i] + vals[j]));
    }
  }
  return out;
}
function uniqueMatch2R(vals, target) {
  const hits = reachable2R(vals).filter((v) => Math.abs(v - target) < TOL).length;
  return hits === 1;
}

// All resistances reachable from a 4-value tray on GRAPH_3R: choose any
// 3 of the 4 values, assign one as the mandatory "mid" resistor, and the
// other two as single/series/parallel feeding into it.
function reachable3R(vals) {
  const out = [];
  for (let leaveOut = 0; leaveOut < vals.length; leaveOut++) {
    const sub = vals.filter((_, k) => k !== leaveOut);
    for (let m = 0; m < sub.length; m++) {
      const mid = sub[m];
      const others = sub.filter((_, k) => k !== m);
      const [x, y] = others;
      out.push(x + mid);
      out.push(y + mid);
      out.push((x * y) / (x + y) + mid);
      out.push(x + y + mid);
    }
  }
  return out;
}
function uniqueMatch3R(vals, target) {
  const hits = reachable3R(vals).filter((v) => Math.abs(v - target) < TOL).length;
  return hits === 1;
}

function makeSeriesLevel() {
  for (let t = 0; t < 300; t++) {
    const a = randInt(2, 15);
    const b = randInt(2, 15);
    const decoy = randInt(2, 20);
    if (a === b || decoy === a || decoy === b) continue;
    const target = a + b;
    if (uniqueMatch2R([a, b, decoy], target)) {
      return {
        title: "Series basics",
        graph: GRAPH_2R,
        tray: shuffle([a, b, decoy]),
        goal: { type: "req", target },
        hint: "Wire it so current has to pass through one resistor, then the other, in a single path. That's series: R_total = R1 + R2.",
      };
    }
  }
  return { title: "Series basics", graph: GRAPH_2R, tray: [4, 8, 7], goal: { type: "req", target: 12 }, hint: "Series: R_total = R1 + R2." };
}

function makeParallelLevel() {
  for (let t = 0; t < 300; t++) {
    const a = randEven(4, 20);
    const decoy = randInt(2, 20);
    if (decoy === a) continue;
    const target = a / 2;
    if (uniqueMatch2R([a, a, decoy], target)) {
      return {
        title: "Parallel basics",
        graph: GRAPH_2R,
        tray: shuffle([a, a, decoy]),
        goal: { type: "req", target },
        hint: "Wire both resistors so each one connects straight from IN to OUT independently. That's parallel.",
      };
    }
  }
  return { title: "Parallel basics", graph: GRAPH_2R, tray: [8, 8, 3], goal: { type: "req", target: 4 }, hint: "Equal resistors in parallel give half the value." };
}

function makeMixed3RLevel(range, title, hint) {
  for (let t = 0; t < 400; t++) {
    const p = randEven(range[0], range[1]);
    const c = randInt(range[0], range[1]);
    const decoy = randInt(range[0], range[1] + 5);
    if (decoy === p || decoy === c) continue;
    const target = p / 2 + c;
    if (uniqueMatch3R([p, p, c, decoy], target)) {
      return { title, graph: GRAPH_3R, tray: shuffle([p, p, c, decoy]), goal: { type: "req", target }, hint, _p: p, _c: c, _decoy: decoy };
    }
  }
  return { title, graph: GRAPH_3R, tray: [6, 6, 3, 10], goal: { type: "req", target: 6 }, hint, _p: 6, _c: 3, _decoy: 10 };
}

function makeOhmTotalCurrentLevel() {
  for (let t = 0; t < 300; t++) {
    const a = randInt(2, 12);
    const b = randInt(2, 12);
    const decoy = randInt(2, 16);
    if (a === b || decoy === a || decoy === b) continue;
    const req = a + b;
    if (!uniqueMatch2R([a, b, decoy], req)) continue;
    const battery = req * randInt(1, 3);
    const target = round2(battery / req);
    return {
      title: "Ohm's law: total current",
      graph: GRAPH_2R,
      battery,
      tray: shuffle([a, b, decoy]),
      goal: { type: "itotal", target },
      hint: "You need I = V \u00f7 R, so first figure out what total resistance gives that current, then build it.",
    };
  }
  return { title: "Ohm's law: total current", graph: GRAPH_2R, battery: 10, tray: [2, 3, 7], goal: { type: "itotal", target: 2 }, hint: "I = V \u00f7 R." };
}

function makeKCLLevel() {
  for (let t = 0; t < 300; t++) {
    const a = randEven(4, 16);
    const decoy = randInt(2, 16);
    if (decoy === a) continue;
    const req = a / 2;
    if (!uniqueMatch2R([a, a, decoy], req)) continue;
    const current = randInt(2, 6); // whole-number target current
    const battery = req * current;
    return {
      title: "Kirchhoff's current law",
      graph: GRAPH_2R,
      battery,
      tray: shuffle([a, a, decoy]),
      goal: { type: "itotal", target: current },
      hint: "In parallel, each resistor sees the full battery voltage and draws its own current. The battery has to supply the sum of both \u2014 that's Kirchhoff's current law.",
    };
  }
  return { title: "Kirchhoff's current law", graph: GRAPH_2R, battery: 12, tray: [3, 6, 4], goal: { type: "itotal", target: 4 }, hint: "Branch currents add up to the total." };
}

function makeKVLLevel() {
  for (let t = 0; t < 300; t++) {
    const a = randInt(2, 12);
    const b = randInt(2, 12);
    const decoy = randInt(2, 16);
    if (a === b || decoy === a || decoy === b) continue;
    const req = a + b;
    if (!uniqueMatch2R([a, b, decoy], req)) continue;
    const current = randInt(1, 4); // whole-number target current
    const battery = req * current;
    const target = current * b; // whole number since current and b are integers
    return {
      title: "Kirchhoff's voltage law",
      graph: GRAPH_2R,
      battery,
      tray: shuffle([a, b, decoy]),
      goal: { type: "vbranch", target, forValue: b },
      hint: `In series, the same current flows through both resistors. Find that current, then use V = I \u00d7 R across the ${b}\u03a9 resistor. The two drops must add up to the battery voltage \u2014 that's Kirchhoff's voltage law.`,
    };
  }
  return { title: "Kirchhoff's voltage law", graph: GRAPH_2R, battery: 15, tray: [2, 3, 6], goal: { type: "vbranch", target: 9, forValue: 3 }, hint: "V = I \u00d7 R for that resistor." };
}

function makeFinalExamLevel() {
  for (let t = 0; t < 400; t++) {
    const p = randEven(4, 14);
    const c = randInt(3, 12);
    const decoy = randInt(2, 16);
    if (decoy === p || decoy === c) continue;
    const req = p / 2 + c;
    if (!uniqueMatch3R([p, p, c, decoy], req)) continue;
    const current = randInt(1, 3); // whole-number target current
    const battery = req * current;
    const target = current * c; // whole number since current and c are integers
    return {
      title: "Final exam: KVL on a mixed network",
      graph: GRAPH_3R,
      battery,
      tray: shuffle([p, p, c, decoy]),
      goal: { type: "vbranch", target, forValue: c },
      hint: `Reduce the parallel pair to one number, add the series resistor, find the total current, then apply V = I \u00d7 R across the ${c}\u03a9 resistor.`,
    };
  }
  return { title: "Final exam: KVL on a mixed network", graph: GRAPH_3R, battery: 20, tray: [6, 6, 7, 4], goal: { type: "vbranch", target: 14, forValue: 7 }, hint: "Reduce, then apply V = I \u00d7 R." };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function generateLevels() {
  const hard = makeMixed3RLevel([4, 15], "Harder network", "Parallel the two that share the load, then add the third resistor in series after.");
  const l7 = { ...hard };
  const l8 = {
    title: "Full circuit, no shortcuts",
    graph: GRAPH_3R,
    battery: (hard._p / 2 + hard._c) * randInt(1, 2),
    tray: hard.tray,
    goal: null, // filled below
    hint: "Same network as last time \u2014 find the equivalent resistance first, then apply I = V \u00f7 R.",
  };
  const l8req = hard._p / 2 + hard._c;
  l8.goal = { type: "itotal", target: round2(l8.battery / l8req) };

  return [
    makeSeriesLevel(),
    makeParallelLevel(),
    makeMixed3RLevel([2, 10], "Series + parallel", "Put two matching resistors in parallel first, then let the result feed into the third resistor in series."),
    makeOhmTotalCurrentLevel(),
    makeKCLLevel(),
    makeKVLLevel(),
    l7,
    l8,
    makeFinalExamLevel(),
  ];
}

// ---------------- Circuit math ----------------
function computeCircuit(graph, placed, wireOn) {
  const parent = {};
  Object.keys(graph.nodes).forEach((n) => (parent[n] = n));
  const find = (x) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  graph.edges.forEach((e) => {
    if (e.kind === "fixed") union(e.a, e.b);
    if (e.kind === "wire" && wireOn[e.id]) union(e.a, e.b);
  });

  const inNode = Object.keys(graph.nodes).find((n) => graph.nodes[n].terminal === "in");
  const outNode = Object.keys(graph.nodes).find((n) => graph.nodes[n].terminal === "out");
  const inRoot = find(inNode);
  const outRoot = find(outNode);
  if (inRoot === outRoot) return { status: "short" };

  let edges = [];
  graph.edges.forEach((e) => {
    if (e.kind === "slot") {
      const val = placed[e.id];
      if (val != null) {
        const a = find(e.a);
        const b = find(e.b);
        if (a !== b) edges.push({ a, b, r: val, tree: { type: "leaf", r: val } });
      }
    }
  });
  if (edges.length === 0) return { status: "open" };

  let changed = true;
  let guard = 0;
  while (changed && guard < 50) {
    changed = false;
    guard++;
    const groups = {};
    edges.forEach((e, i) => {
      const key = [e.a, e.b].sort().join("|");
      (groups[key] = groups[key] || []).push(i);
    });
    for (const key in groups) {
      const idxs = groups[key];
      if (idxs.length > 1) {
        const group = idxs.map((i) => edges[i]);
        const invSum = group.reduce((s, g) => s + 1 / g.r, 0);
        const r = 1 / invSum;
        const merged = { a: group[0].a, b: group[0].b, r, tree: { type: "parallel", r, children: group.map((g) => g.tree) } };
        edges = edges.filter((_, i) => !idxs.includes(i));
        edges.push(merged);
        changed = true;
        break;
      }
    }
    if (changed) continue;
    const degree = {};
    edges.forEach((e) => {
      degree[e.a] = (degree[e.a] || 0) + 1;
      degree[e.b] = (degree[e.b] || 0) + 1;
    });
    for (const node in degree) {
      if (node === inRoot || node === outRoot) continue;
      if (degree[node] === 2) {
        const idxs = [];
        edges.forEach((e, i) => {
          if (e.a === node || e.b === node) idxs.push(i);
        });
        if (idxs.length !== 2) continue;
        const [e1, e2] = idxs.map((i) => edges[i]);
        const other1 = e1.a === node ? e1.b : e1.a;
        const other2 = e2.a === node ? e2.b : e2.a;
        const r = e1.r + e2.r;
        const merged = { a: other1, b: other2, r, tree: { type: "series", r, children: [e1.tree, e2.tree] } };
        edges = edges.filter((_, i) => i !== idxs[0] && i !== idxs[1]);
        edges.push(merged);
        changed = true;
        break;
      }
    }
  }

  if (edges.length === 1 && ((edges[0].a === inRoot && edges[0].b === outRoot) || (edges[0].a === outRoot && edges[0].b === inRoot))) {
    return { status: "ok", r: edges[0].r, tree: edges[0].tree };
  }
  return { status: "incomplete" };
}

function assignCurrents(node, current) {
  node.current = current;
  node.voltage = current * node.r;
  if (node.type === "series") {
    assignCurrents(node.children[0], current);
    assignCurrents(node.children[1], current);
  } else if (node.type === "parallel") {
    const v = node.voltage;
    node.children.forEach((c) => assignCurrents(c, v / c.r));
  }
}

function findLeaf(node, value, acc = []) {
  if (node.type === "leaf") {
    if (Math.abs(node.r - value) < 0.001) acc.push(node);
  } else {
    node.children.forEach((c) => findLeaf(c, value, acc));
  }
  return acc;
}

const round = (n) => Math.round(n * 100) / 100;

// ---------------- Icons ----------------
function ResistorIcon({ w = 64, color = COLORS.copperBright }) {
  const h = 22;
  const mid = h / 2;
  const path = `M0,${mid} L${w * 0.14},${mid} L${w * 0.22},${h * 0.1} L${w * 0.32},${h * 0.9} L${w * 0.42},${h * 0.1} L${w * 0.52},${h * 0.9} L${w * 0.62},${h * 0.1} L${w * 0.72},${h * 0.9} L${w * 0.8},${mid} L${w},${mid}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function BatteryIcon({ x, y, voltage }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <line x1={0} y1={-18} x2={0} y2={-6} stroke={COLORS.amber} strokeWidth={2.5} />
      <line x1={-12} y1={-6} x2={12} y2={-6} stroke={COLORS.amber} strokeWidth={3} />
      <line x1={-6} y1={2} x2={6} y2={2} stroke={COLORS.amber} strokeWidth={1.5} />
      <line x1={0} y1={2} x2={0} y2={14} stroke={COLORS.amber} strokeWidth={2.5} />
      <text x={20} y={2} fill={COLORS.amber} fontFamily="'IBM Plex Mono', monospace" fontSize={13}>
        {voltage}V
      </text>
    </g>
  );
}

function TrayChip({ value, onPointerDownStart, dragging }) {
  return (
    <div
      onPointerDown={(e) => onPointerDownStart(e, value)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1.5px solid ${COLORS.line}`,
        background: COLORS.panelAlt,
        cursor: "grab",
        touchAction: "none",
        opacity: dragging ? 0.25 : 1,
        userSelect: "none",
      }}
    >
      <ResistorIcon w={54} color={COLORS.copper} />
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: COLORS.cream }}>{`${value}\u03a9`}</span>
    </div>
  );
}

function scoreForLevel(moves, seconds) {
  return Math.max(50, Math.round(1000 - moves * 15 - seconds * 3));
}

// ---------------- Main component ----------------
export default function CircuitBreaker() {
  const [levels, setLevels] = useState(() => generateLevels());
  const [levelIndex, setLevelIndex] = useState(0);
  const [placed, setPlaced] = useState({});
  const [usedTrayIdx, setUsedTrayIdx] = useState({});
  const [wireOn, setWireOn] = useState({});
  const [solved, setSolved] = useState({});
  const [levelScores, setLevelScores] = useState({});
  const [moves, setMoves] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [hoverSlot, setHoverSlot] = useState(null);
  const [drag, setDrag] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null); // null = not loaded yet
  const [historyStatus, setHistoryStatus] = useState("idle"); // idle | loading
  const [storageOk, setStorageOk] = useState(null); // null = unknown, true/false once tested
  const [localRuns, setLocalRuns] = useState([]); // session-only fallback when storage isn't available
  const [submitted, setSubmitted] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const startTimeRef = useRef(Date.now());
  const localRunsRef = useRef([]);

  const level = levels[levelIndex];
  const graph = level ? level.graph : null;
  const won = level ? solved[levelIndex] : false;
  const finished = levelIndex >= levels.length;
  const totalScore = useMemo(() => Object.values(levelScores).reduce((s, v) => s + v, 0), [levelScores]);

  useEffect(() => {
    setPlaced({});
    setUsedTrayIdx({});
    setWireOn({});
    setShowHint(false);
    setHoverSlot(null);
    setDrag(null);
    setMoves(0);
    startTimeRef.current = Date.now();
  }, [levelIndex]);

  const remainingTray = useMemo(() => {
    if (!level) return [];
    const used = new Set(Object.values(usedTrayIdx));
    return level.tray.map((v, i) => ({ v, i })).filter((t) => !used.has(t.i));
  }, [level, usedTrayIdx]);

  const result = useMemo(() => {
    if (!graph) return { status: "open" };
    return computeCircuit(graph, placed, wireOn);
  }, [graph, placed, wireOn]);

  const evalGoal = useMemo(() => {
    if (!level || result.status !== "ok") return { value: null };
    const { goal, battery } = level;
    if (goal.type === "req") return { value: result.r, unit: "\u03a9", label: "Equivalent resistance" };
    if (!battery) return { value: null };
    const itotal = result.r > 0 ? battery / result.r : Infinity;
    if (goal.type === "itotal") return { value: itotal, unit: "A", label: "Current from battery" };
    if (goal.type === "vbranch") {
      const tree = JSON.parse(JSON.stringify(result.tree));
      assignCurrents(tree, itotal);
      const leaves = findLeaf(tree, goal.forValue);
      if (leaves.length === 0) return { value: null, missing: true };
      return { value: leaves[0].voltage, unit: "V", label: `Voltage across ${goal.forValue}\u03a9` };
    }
    return { value: null };
  }, [level, result]);

  useEffect(() => {
    if (!level || won) return;
    if (evalGoal.value != null && Math.abs(evalGoal.value - level.goal.target) < 0.03) {
      const seconds = (Date.now() - startTimeRef.current) / 1000;
      const s = scoreForLevel(moves, seconds);
      setSolved((prev) => ({ ...prev, [levelIndex]: true }));
      setLevelScores((prev) => ({ ...prev, [levelIndex]: s }));
    }
  }, [evalGoal, level, levelIndex, won, moves]);

  const onTrayPointerDown = useCallback((e, value, trayIdx) => {
    e.preventDefault();
    setDrag({ value, trayIdx, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!drag) return;
    function move(e) {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = el && el.closest ? el.closest("[data-slot]") : null;
      const slotId = slotEl ? slotEl.getAttribute("data-slot") : null;
      setHoverSlot(slotId && placed[slotId] == null ? slotId : null);
    }
    function up(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = el && el.closest ? el.closest("[data-slot]") : null;
      const slotId = slotEl ? slotEl.getAttribute("data-slot") : null;
      if (slotId && placed[slotId] == null) {
        setPlaced((p) => ({ ...p, [slotId]: drag.value }));
        setUsedTrayIdx((u) => ({ ...u, [slotId]: drag.trayIdx }));
        setMoves((m) => m + 1);
      }
      setDrag(null);
      setHoverSlot(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, placed]);

  function removeFromSlot(slotId) {
    if (won) return;
    setPlaced((p) => {
      const n = { ...p };
      delete n[slotId];
      return n;
    });
    setUsedTrayIdx((u) => {
      const n = { ...u };
      delete n[slotId];
      return n;
    });
  }

  function toggleWire(wireId) {
    if (won) return;
    setWireOn((w) => ({ ...w, [wireId]: !w[wireId] }));
    setMoves((m) => m + 1);
  }

  function resetBoard() {
    setPlaced({});
    setUsedTrayIdx({});
    setWireOn({});
    setHoverSlot(null);
    setShowHint(false);
    setDrag(null);
    setMoves(0);
    startTimeRef.current = Date.now();
  }

  function resetLevel() {
    resetBoard();
  }

  function goNext() {
    resetBoard();
    if (levelIndex < levels.length - 1) setLevelIndex((i) => i + 1);
    else setLevelIndex(levels.length);
  }

  function playAgain() {
    resetBoard();
    setLevels(generateLevels());
    setSolved({});
    setLevelScores({});
    setSubmitted(false);
    setIsNewBest(false);
    setLevelIndex(0);
  }

  // ---- Personal history (private to this student, not visible to anyone else) ----
  // Falls back to an in-memory, session-only history if persistent storage isn't
  // available (e.g. the artifact isn't published, or storage is otherwise blocked
  // for this viewer). The game stays fully playable either way.
  function recordLocalRun(score) {
    const prevBest = localRunsRef.current.reduce((m, r) => Math.max(m, r.score), 0);
    const updated = [...localRunsRef.current, { score, date: Date.now() }].sort((a, b) => b.score - a.score).slice(0, 50);
    localRunsRef.current = updated;
    setLocalRuns(updated);
    setIsNewBest(score > prevBest);
  }

  async function loadHistory() {
    setHistoryStatus("loading");
    try {
      if (!window.storage) throw new Error("no storage API");
      const res = await window.storage.get(HISTORY_KEY, false);
      const list = res ? JSON.parse(res.value) : [];
      list.sort((a, b) => b.score - a.score);
      setHistory(list);
      setStorageOk(true);
    } catch (err) {
      setStorageOk(false);
    }
    setHistoryStatus("idle");
  }

  async function saveRun(score) {
    try {
      if (!window.storage) throw new Error("no storage API");
      const res = await window.storage.get(HISTORY_KEY, false);
      let list = res ? JSON.parse(res.value) : [];
      const prevBest = list.reduce((m, r) => Math.max(m, r.score), 0);
      list.push({ score, date: Date.now() });
      list.sort((a, b) => b.score - a.score);
      list = list.slice(0, 50);
      await window.storage.set(HISTORY_KEY, JSON.stringify(list), false);
      setHistory(list);
      setStorageOk(true);
      setIsNewBest(score > prevBest);
    } catch (err) {
      setStorageOk(false);
      recordLocalRun(score);
    }
  }

  // Quietly check storage availability on load, so the fallback note can show
  // up front rather than only after a student finishes their first run.
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (finished && !submitted) {
      setSubmitted(true);
      saveRun(totalScore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function openHistory() {
    setShowHistory(true);
    loadHistory();
  }

  const displayedRuns = storageOk === false ? localRuns : history;

  let liveMessage = null;
  let liveColor = COLORS.muted;
  if (level) {
    if (result.status === "open") liveMessage = "No path from IN to OUT yet.";
    else if (result.status === "short") {
      liveMessage = "IN and OUT are wired straight together \u2014 that's a short, not a circuit.";
      liveColor = COLORS.alert;
    } else if (result.status === "incomplete") liveMessage = "That wiring doesn't reduce to a clean path yet.";
    else if (evalGoal.missing) liveMessage = `Place the ${level.goal.forValue}\u03a9 resistor to measure it.`;
    else if (evalGoal.value != null) {
      const hit = Math.abs(evalGoal.value - level.goal.target) < 0.03;
      liveMessage = `${evalGoal.label}: ${round(evalGoal.value)}${evalGoal.unit}`;
      liveColor = hit ? COLORS.amber : COLORS.teal;
    }
  }

  function goalText(lv) {
    const g = lv.goal;
    if (g.type === "req") return `Build a circuit with a total resistance of ${g.target}\u03a9.`;
    if (g.type === "itotal") return `Get exactly ${g.target}A flowing from the ${lv.battery}V battery.`;
    if (g.type === "vbranch") return `Get exactly ${g.target}V across the ${g.forValue}\u03a9 resistor.`;
    return "";
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.cream, fontFamily: "'Space Grotesk', system-ui, sans-serif", padding: "32px 20px 60px", boxSizing: "border-box" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        button:focus-visible { outline: 2px solid ${COLORS.teal}; outline-offset: 2px; }
        input:focus-visible { outline: 2px solid ${COLORS.teal}; outline-offset: 2px; }
        .cb-btn { background: ${COLORS.copper}; color: #0F2419; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 600; cursor: pointer; font-size: 14px; }
        .cb-btn:hover { background: ${COLORS.copperBright}; }
        .cb-btn-ghost { background: transparent; color: ${COLORS.cream}; border: 1.5px solid ${COLORS.line}; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-size: 14px; }
        .cb-btn-ghost:hover { border-color: ${COLORS.teal}; }
        .cb-input { background: ${COLORS.panelAlt}; border: 1.5px solid ${COLORS.line}; border-radius: 8px; padding: 8px 12px; color: ${COLORS.cream}; font-size: 13px; font-family: inherit; }
        @media (max-width: 760px) { .cb-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Circuit Breaker</h1>
            <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: 15 }}>Drag resistors onto the board, wire them up, and watch the circuit solve itself.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: COLORS.amber }}>{totalScore} pts</div>
            <button className="cb-btn-ghost" onClick={openHistory}>My progress</button>
            {storageOk === false && <span style={{ fontSize: 11, color: COLORS.muted }}>(this session only)</span>}
          </div>
        </div>

        {showHistory && (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Your progress</h3>
              <button className="cb-btn-ghost" onClick={() => setShowHistory(false)}>Close</button>
            </div>
            {historyStatus === "loading" && <p style={{ color: COLORS.muted, fontSize: 13 }}>Loading your runs…</p>}
            {historyStatus !== "loading" && storageOk === false && (
              <p style={{ color: COLORS.teal, fontSize: 13, marginBottom: 10 }}>
                Progress saving isn't available right now (this can happen if the game hasn't been published, or your browser is blocking it). You can still play — the runs below are just for this session and won't be here next time.
              </p>
            )}
            {historyStatus !== "loading" && displayedRuns && displayedRuns.length === 0 && (
              <p style={{ color: COLORS.muted, fontSize: 13 }}>No completed runs yet — clear the board once to set your first score.</p>
            )}
            {historyStatus !== "loading" && displayedRuns && displayedRuns.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {displayedRuns.map((entry, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 10px", borderRadius: 8, background: i === 0 ? COLORS.panelAlt : "transparent" }}>
                    <span style={{ color: i === 0 ? COLORS.copperBright : COLORS.cream }}>{i === 0 ? "Best run" : new Date(entry.date).toLocaleDateString()}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLORS.amber }}>{entry.score} pts</span>
                  </div>
                ))}
              </div>
            )}
            {storageOk !== false && (
              <p style={{ fontSize: 11, color: COLORS.muted, marginTop: 12 }}>Only visible to you — nothing here is shared with other students.</p>
            )}
          </div>
        )}

        {!finished && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {levels.map((_, i) => (
              <div key={i} style={{ width: i === levelIndex ? 22 : 8, height: 8, borderRadius: 4, background: i === levelIndex ? COLORS.copperBright : solved[i] ? COLORS.teal : COLORS.line, transition: "width 160ms ease, background 160ms ease" }} />
            ))}
          </div>
        )}

        {finished ? (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: "40px 32px" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, margin: "0 0 8px" }}>Board cleared</h2>
              <p style={{ color: COLORS.muted, maxWidth: 460, margin: "0 auto" }}>
                Series, parallel, mixed networks, Ohm's law, and Kirchhoff's current and voltage laws — all wired by hand.
              </p>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, color: COLORS.amber, margin: "16px 0" }}>{totalScore} pts</div>
              {isNewBest && <div style={{ color: COLORS.teal, fontSize: 14, fontWeight: 600 }}>New personal best</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
              {levels.map((lv, i) => (
                <div key={i} style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{lv.title}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLORS.teal, fontSize: 15 }}>{levelScores[i] ?? 0} pts</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="cb-btn" onClick={playAgain}>Play again</button>
              <button className="cb-btn-ghost" onClick={openHistory}>View my progress</button>
            </div>
          </div>
        ) : (
          <div className="cb-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20, alignSelf: "start" }}>
              <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>Level {levelIndex + 1} of {levels.length}</div>
              <h2 style={{ fontSize: 19, margin: "0 0 14px", lineHeight: 1.3 }}>{level.title}</h2>
              <p style={{ fontSize: 14, color: COLORS.cream, lineHeight: 1.5, margin: "0 0 14px" }}>{goalText(level)}</p>

              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: COLORS.panelAlt,
                  border: `1px solid ${COLORS.line}`,
                  color: liveColor,
                  minHeight: 20,
                  marginBottom: 10,
                }}
              >
                {liveMessage}
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>Moves: {moves}</div>

              <button className="cb-btn-ghost" style={{ width: "100%" }} onClick={() => setShowHint((h) => !h)}>
                {showHint ? "Hide hint" : "Show hint"}
              </button>
              {showHint && <p style={{ fontSize: 13, color: COLORS.teal, marginTop: 10, lineHeight: 1.5 }}>{level.hint}</p>}

              <button className="cb-btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={resetLevel}>Reset level</button>

              {won && (
                <div style={{ marginTop: 16, padding: 14, background: "rgba(232,179,77,0.12)", border: `1px solid ${COLORS.amber}`, borderRadius: 10 }}>
                  <div style={{ color: COLORS.amber, fontWeight: 600, marginBottom: 4 }}>Target reached</div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 10 }}>+{levelScores[levelIndex]} pts</div>
                  <button className="cb-btn" style={{ width: "100%" }} onClick={goNext}>
                    {levelIndex < levels.length - 1 ? "Next level" : "Finish"}
                  </button>
                </div>
              )}
            </div>

            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20 }}>
              <svg viewBox={graph.viewBox} style={{ width: "100%", height: "auto", display: "block" }}>
                {graph.edges.map((e) => {
                  const a = graph.nodes[e.a];
                  const b = graph.nodes[e.b];
                  if (e.kind === "fixed") {
                    return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.wireOn} strokeWidth={3} />;
                  }
                  if (e.kind === "wire") {
                    const on = !!wireOn[e.id];
                    return (
                      <g key={e.id} style={{ cursor: won ? "default" : "pointer" }} onClick={() => toggleWire(e.id)}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18} />
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={on ? COLORS.wireOn : COLORS.wireOff}
                          strokeWidth={on ? 3.5 : 2}
                          strokeDasharray={on ? undefined : e.dashed ? "3 5" : "5 5"}
                        />
                      </g>
                    );
                  }
                  return null;
                })}

                {graph.edges
                  .filter((e) => e.kind === "slot")
                  .map((e) => {
                    const a = graph.nodes[e.a];
                    const b = graph.nodes[e.b];
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    const val = placed[e.id];
                    const hovered = hoverSlot === e.id;
                    return (
                      <g key={e.id}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={val != null ? COLORS.wireOn : COLORS.wireOff} strokeWidth={val != null ? 3 : 1.5} strokeDasharray={val != null ? undefined : "2 4"} />
                        <g data-slot={e.id} onClick={() => val != null && removeFromSlot(e.id)} style={{ cursor: val != null && !won ? "pointer" : "default" }}>
                          <rect
                            x={mx - 40}
                            y={my - 18}
                            width={80}
                            height={36}
                            rx={8}
                            fill={hovered ? "rgba(95,168,160,0.18)" : val != null ? COLORS.panelAlt : "rgba(0,0,0,0.15)"}
                            stroke={hovered ? COLORS.teal : val != null ? COLORS.copper : COLORS.line}
                            strokeWidth={hovered ? 2 : 1.5}
                            strokeDasharray={val == null ? "4 4" : undefined}
                          />
                          {val != null ? (
                            <g transform={`translate(${mx - 27},${my - 11})`}>
                              <ResistorIcon w={54} color={COLORS.copperBright} />
                            </g>
                          ) : (
                            <text x={mx} y={my + 5} textAnchor="middle" fill={COLORS.muted} fontSize={11} fontFamily="'IBM Plex Mono', monospace">
                              drop here
                            </text>
                          )}
                        </g>
                        {val != null && (
                          <text x={mx} y={my + 30} textAnchor="middle" fill={COLORS.muted} fontSize={11} fontFamily="'IBM Plex Mono', monospace">
                            {`${val}\u03a9`}
                          </text>
                        )}
                      </g>
                    );
                  })}

                {Object.entries(graph.nodes)
                  .filter(([, n]) => n.terminal)
                  .map(([id, n]) => (
                    <g key={id}>
                      <circle cx={n.x} cy={n.y} r={7} fill={COLORS.bg} stroke={COLORS.copperBright} strokeWidth={2.5} />
                      <text x={n.x} y={n.y - 16} textAnchor="middle" fill={COLORS.muted} fontSize={12} fontFamily="'IBM Plex Mono', monospace">
                        {level.battery ? (n.terminal === "in" ? "+" : "\u2212") : n.terminal === "in" ? "IN" : "OUT"}
                      </text>
                    </g>
                  ))}

                {level.battery && (() => {
                  const inNode = Object.values(graph.nodes).find((n) => n.terminal === "in");
                  return <BatteryIcon x={inNode.x - 30} y={inNode.y - 30} voltage={level.battery} />;
                })()}
              </svg>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${COLORS.line}` }}>
                {remainingTray.map(({ v, i }) => (
                  <TrayChip key={i} value={v} dragging={drag && drag.trayIdx === i} onPointerDownStart={(e) => onTrayPointerDown(e, v, i)} />
                ))}
                {remainingTray.length === 0 && <span style={{ color: COLORS.muted, fontSize: 13 }}>All parts placed.</span>}
              </div>
              <p style={{ fontSize: 12, color: COLORS.muted, marginTop: 12 }}>
                Drag a resistor onto a socket. Click the thin lines to add or remove a wire. Click a placed resistor to take it back. Fewer moves and less time means a higher score.
              </p>
            </div>
          </div>
        )}
      </div>

      {drag && (
        <div style={{ position: "fixed", left: drag.x - 27, top: drag.y - 11, pointerEvents: "none", zIndex: 50 }}>
          <ResistorIcon w={54} color={COLORS.copperBright} />
        </div>
      )}
    </div>
  );
}
