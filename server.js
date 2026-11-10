// Backend: menangkap diagnosis dari MQTT lalu meneruskannya realtime ke browser lewat WebSocket.
//   MQTT  mesin/+/hasil  ->  validasi  ->  simpan di memori  ->  broadcast WebSocket (/ws)
// Menyajikan juga halaman HTML dari folder public/.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import mqtt from "mqtt";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port ?? process.env.PORT ?? 3000);
const MQTT_URL = args.broker ?? process.env.MQTT_URL ?? "mqtt://localhost:1883";
const TOPIC = "mesin/+/hasil";
const HISTORY_MAX = 200;
const MAX_PAYLOAD_BYTES = 1024;
const VALID_DIAGNOSIS = new Set(["normal", "inner", "outer"]);
const DEVICE_ID_RX = /^[A-Za-z0-9_-]{1,32}$/;

const latest = new Map(); // device_id -> event terakhir
const history = []; // event terbaru di akhir
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- HTTP + WebSocket
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (_req, res) => res.json({ mqtt: mqttClient.connected, ws_clients: wss.clients.size, devices: latest.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 });

function broadcast(obj) {
  const text = JSON.stringify(obj);
  for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(text);
}

wss.on("connection", (ws) => {
  // klien baru langsung menerima keadaan terakhir supaya halaman tidak kosong
  ws.send(JSON.stringify({
    type: "snapshot",
    now: Date.now(),
    broker: mqttClient.connected,
    devices: Object.fromEntries(latest),
    history,
  }));
});

// ---------------------------------------------------------------- MQTT
const mqttClient = mqtt.connect(MQTT_URL, { reconnectPeriod: 2000 });

mqttClient.on("connect", () => {
  console.log(`[server] terhubung ke broker ${MQTT_URL}`);
  mqttClient.subscribe(TOPIC, { qos: 0 }, (err) => {
    if (err) console.log(`[server] gagal subscribe: ${err.message}`);
    else console.log(`[server] subscribe ${TOPIC}`);
  });
  broadcast({ type: "broker", connected: true });
});
mqttClient.on("close", () => broadcast({ type: "broker", connected: false }));
mqttClient.on("error", (e) => console.log(`[server] MQTT error: ${e.message}`));

mqttClient.on("message", (topic, payload) => {
  // Data dari jaringan tidak dipercaya: cek topik, ukuran, format, dan nilai.
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== "mesin" || parts[2] !== "hasil" || !DEVICE_ID_RX.test(parts[1])) return;
  if (payload.length > MAX_PAYLOAD_BYTES) return console.log(`[server] payload terlalu besar dari ${topic}, diabaikan`);

  let msg;
  try { msg = JSON.parse(payload.toString("utf8")); } catch { return console.log(`[server] JSON tidak valid dari ${topic}`); }
  if (!msg || typeof msg !== "object" || !VALID_DIAGNOSIS.has(msg.diagnosis)) {
    return console.log(`[server] diagnosis tidak dikenal dari ${topic}, diabaikan`);
  }
  const conf = Number(msg.confidence);
  const event = {
    device: parts[1], // ID diambil dari topik, bukan dari isi pesan
    diagnosis: msg.diagnosis,
    confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null,
    seq: Number.isInteger(msg.seq) ? msg.seq : null,
    device_ts: Number.isFinite(msg.ts) ? msg.ts : null,
    model: typeof msg.model === "string" ? msg.model.slice(0, 40) : null,
    server_ts: Date.now(),
  };

  latest.set(event.device, event);
  history.push(event);
  if (history.length > HISTORY_MAX) history.shift();
  broadcast({ type: "diagnosis", data: event });
});

// ---------------------------------------------------------------- start
server.listen(PORT, () => console.log(`[server] halaman: http://localhost:${PORT}  |  WebSocket: ws://localhost:${PORT}/ws`));

process.on("SIGINT", () => {
  mqttClient.end(true);
  wss.close();
  server.close(() => process.exit(0));
});
