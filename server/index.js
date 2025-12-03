const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");

// --- KONFIGURASI ---
const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const DATABASE_URL = process.env.DATABASE_URL;

// --- INISIALISASI ---
const app = express();
app.use(cors());

const server = http.createServer(app);
const prisma = new PrismaClient();

// --- 1. SETUP REDIS ADAPTER (DISTRIBUTED CORE) ---
// PubClient: Untuk 'berteriak' (Publish)
// SubClient: Untuk 'mendengar' (Subscribe)
const pubClient = createClient({ url: `redis://${REDIS_HOST}:6379` });
const subClient = pubClient.duplicate();

// --- LOGIKA UTAMA ---
async function startServer() {
  // Tunggu koneksi Redis & DB siap
  await Promise.all([pubClient.connect(), subClient.connect()]);
  console.log(`✅ Connected to Redis at ${REDIS_HOST}`);

  // Pasang Socket.io
  const io = new Server(server, {
    cors: { origin: "*" }, // Izinkan semua frontend (dev mode)
    adapter: createAdapter(pubClient, subClient) // INI KUNCINYA!
  });

  // --- 2. WEBSOCKET EVENT HANDLER ---
  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id} on Node ${process.env.SERVER_ID || 'Local'}`);

    // Client meminta masuk ke dokumen tertentu
    socket.on("join-document", async (docId) => {
      socket.join(docId); // Masukkan socket ke "Room"
      console.log(`User ${socket.id} joined room ${docId}`);

      // Ambil data terakhir dari DB
      const doc = await prisma.document.findUnique({ where: { id: docId } });
      
      if (doc) {
        // Kirim data binary yang ada di DB ke Client
        // Client akan menggabungkannya (Merge) dengan Yjs
        socket.emit("load-document", doc.content);
      }
    });

    // Client mengirim update ketikan (Binary Blob)
    socket.on("sync-update", async ({ docId, update }) => {
      // 1. Broadcast ke user lain di Room yang sama
      // (Berkat Redis Adapter, user di server lain pun akan dapat!)
      socket.to(docId).emit("sync-update", update);

      // 2. Simpan ke Database (Debouncing sederhana)
      // Di sistem nyata, gunakan queue. Di sini kita simpan langsung.
      saveToDatabase(docId, update);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// Fungsi Simpan ke DB
async function saveToDatabase(docId, contentBuffer) {
  try {
    // Buffer dari client perlu divalidasi, tapi untuk demo kita anggap aman
    // Kita gunakan upsert (Update kalau ada, Create kalau belum)
    await prisma.document.upsert({
      where: { id: docId },
      update: { content: Buffer.from(contentBuffer) },
      create: { id: docId, content: Buffer.from(contentBuffer) },
    });
    // console.log(`💾 Saved doc ${docId} to DB`);
  } catch (e) {
    console.error("Failed to save DB:", e);
  }
}

startServer();