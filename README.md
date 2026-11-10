# esp-monitor

Simulasi ESP -> MQTT -> Node.js -> WebSocket -> halaman HTML.

## Menjalankan (butuh Node.js 18+)

    npm install

Buka 3 terminal:

    npm run broker     # 1) broker MQTT lokal untuk dev (lewati jika sudah punya Mosquitto/EMQX)
    npm start          # 2) backend + halaman  -> buka http://localhost:3000
    npm run sim        # 3) simulasi ESP

Opsi:

    node simulator.js --devices esp32-01,esp32-02 --interval 500   # banyak perangkat, kirim tiap 500 ms
    node simulator.js --force outer                                # paksa satu jenis diagnosis (uji tampilan)
    node server.js --port 8080 --broker mqtt://192.168.1.10:1883   # broker/port lain (atau env MQTT_URL, PORT)

## Kontrak pesan dari ESP

Topik : mesin/<device_id>/hasil        (device_id: huruf/angka/_/-, maks 32 karakter)
Payload (JSON, maks 1 KB):

    {"device_id":"esp32-01","seq":123,"ts":1767000000000,"diagnosis":"normal","confidence":0.95,"model":"subf-v3-int8"}

- diagnosis : "normal" | "inner" | "outer"  (nilai lain ditolak)
- confidence: 0..1 (opsional), seq: bilangan bulat (opsional), ts: ms epoch dari perangkat (opsional)
- ID perangkat diambil dari TOPIK, bukan dari isi pesan.

## Alur data

    ESP --MQTT--> broker --> server.js (validasi, simpan 200 kejadian terakhir di memori)
                                |--WebSocket /ws--> browser (snapshot saat tersambung, lalu kejadian realtime)

## Catatan

- dev-broker.js tanpa autentikasi dan hanya menerima koneksi lokal. Untuk produksi pakai Mosquitto/EMQX
  dengan username/password dan TLS (port 8883), lalu isi --broker dengan URL mqtts://...
- Data hanya disimpan di memori server; restart server mengosongkan riwayat.
