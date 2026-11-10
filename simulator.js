// Simulasi ESP: mengirim HASIL DIAGNOSIS (normal / inner / outer) lewat MQTT.
// Topik : mesin/<device_id>/hasil
// Payload: {"device_id","seq","ts","diagnosis","confidence","model"}
//
// Contoh:
//   node simulator.js
//   node simulator.js --devices esp32-01,esp32-02 --interval 500
//   node simulator.js --force outer          (selalu kirim outer, untuk uji tampilan)
import mqtt from "mqtt";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const BROKER = args.broker ?? process.env.MQTT_URL ?? "mqtt://localhost:1883";
const DEVICES = String(args.devices ?? "esp32-01").split(",").map((s) => s.trim()).filter(Boolean);
const INTERVAL = Number(args.interval ?? 1000); // ms antar diagnosis
const FORCE = args.force && ["normal", "inner", "outer"].includes(args.force) ? args.force : null;
const MODEL = "subf-v3-int8";

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; } // kira-kira N(0, ~0.5)

// Tiap perangkat bergantian: lama normal, sesekali "episode" kerusakan inner/outer.
function pickNext(prev) {
  if (FORCE) return { state: FORCE, ticks: 1e9 };
  if (prev !== "normal") return { state: "normal", ticks: randInt(15, 40) };
  return Math.random() < 0.5
    ? { state: "inner", ticks: randInt(8, 20) }
    : { state: "outer", ticks: randInt(8, 20) };
}

const devices = DEVICES.map((id) => ({ id, seq: 0, ...(FORCE ? pickNext("x") : { state: "normal", ticks: randInt(10, 25) }) }));

const client = mqtt.connect(BROKER, { reconnectPeriod: 2000 });
client.on("connect", () => console.log(`[sim] terhubung ke ${BROKER}; perangkat: ${DEVICES.join(", ")}; interval ${INTERVAL} ms`));
client.on("reconnect", () => console.log("[sim] mencoba menghubungkan ulang ..."));
client.on("error", (e) => console.log(`[sim] error: ${e.message}`));

setInterval(() => {
  if (!client.connected) return;
  for (const d of devices) {
    if (--d.ticks <= 0) Object.assign(d, pickNext(d.state));
    const conf = d.state === "normal" ? 0.95 + 0.03 * gauss() : 0.86 + 0.08 * gauss();
    const msg = {
      device_id: d.id,
      seq: ++d.seq,
      ts: Date.now(),
      diagnosis: d.state,
      confidence: Number(clamp(conf, 0.5, 0.99).toFixed(3)),
      model: MODEL,
    };
    client.publish(`mesin/${d.id}/hasil`, JSON.stringify(msg), { qos: 0 });
    console.log(`[sim] ${d.id} #${msg.seq} -> ${msg.diagnosis.padEnd(6)} (${(msg.confidence * 100).toFixed(1)}%)`);
  }
}, INTERVAL);

process.on("SIGINT", () => client.end(false, () => process.exit(0)));
