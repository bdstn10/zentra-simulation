// Broker MQTT lokal UNTUK PENGEMBANGAN saja (tanpa autentikasi, hanya menerima koneksi dari komputer ini).
// Jika Anda sudah punya Mosquitto/EMQX, lewati file ini dan arahkan server & simulator ke broker tersebut.
import net from "node:net";
import { Aedes } from "aedes";

const PORT = Number(process.argv[2] ?? process.env.MQTT_PORT ?? 1883);

const aedes = await Aedes.createBroker();
const server = net.createServer(aedes.handle);

aedes.on("client", (c) => console.log(`[broker] klien terhubung   : ${c.id}`));
aedes.on("clientDisconnect", (c) => console.log(`[broker] klien terputus    : ${c.id}`));

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[broker] MQTT dev broker aktif di mqtt://127.0.0.1:${PORT} (tanpa autentikasi, hanya lokal)`);
});

process.on("SIGINT", () => {
  server.close();
  aedes.close(() => process.exit(0));
});
