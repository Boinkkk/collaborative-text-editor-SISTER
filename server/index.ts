import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import cors from "cors";
import {prisma} from './lib/prisma'
require("dotenv").config();
import * as Y from "yjs";



const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";

// --- TIPE DATA ---
interface ServerToClientEvents {
  "load-document": (data: Buffer) => void;
  "sync-update": (update: Uint8Array) => void;
}

interface ClientToServerEvents {
  "join-document": (docId: string) => void;
  "sync-update": (data: { docId: string; update: Uint8Array }) => void;
}

const app = express();
app.use(cors());

const server = http.createServer(app);

// Inisialisasi Prisma

const pubClient = createClient({ url: `redis://${REDIS_HOST}:6379` });
const subClient = pubClient.duplicate();

async function startServer() {
  await Promise.all([pubClient.connect(), subClient.connect()]);
  console.log(`✅ Connected to Redis at ${REDIS_HOST}`);

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: "*" },
    adapter: createAdapter(pubClient, subClient),
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on("join-document", async (docId) => {
      socket.join(docId);
      
      // Ambil data dari DB
      const doc = await prisma.document.findUnique({ where: { id: docId } });

      if (doc) {
        // Kirim data full ke user
        socket.emit("load-document", Buffer.from(doc.content));
      } else {
        // Jika dokumen baru, buat Y.Doc kosong lalu simpan inisialnya
        const ydoc = new Y.Doc();
        const state = Y.encodeStateAsUpdate(ydoc);
        await saveToDatabase(docId, state);
        socket.emit("load-document", Buffer.from(state));
      }
    });

    socket.on("sync-update", async ({ docId, update }) => {
      // 1. Broadcast ke user lain (Real-time)
      socket.to(docId).emit("sync-update", update);

      // 2. Merge & Simpan ke DB (Persistence)
      await saveToDatabase(docId, update);
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// --- FUNGSI SAVE YANG SUDAH DIPERBAIKI ---
async function saveToDatabase(docId: string, newUpdate: Uint8Array) {
  try {
    // 1. Ambil data lama dari Database
    const currentDoc = await prisma.document.findUnique({ 
        where: { id: docId },
        select: { content: true } // Hemat bandwidth, ambil content saja
    });

    let finalBlob: Uint8Array;

    if (currentDoc && currentDoc.content) {
        // 2. GABUNGKAN (MERGE): Data Lama + Update Baru
        // Prisma menyimpan 'Bytes' sebagai Buffer, Yjs butuh Uint8Array
        const currentUint8 = new Uint8Array(currentDoc.content);
        
        // Y.mergeUpdates adalah magic function-nya
        const mergedUpdate = Y.mergeUpdates([currentUint8, newUpdate]);
        finalBlob = new Uint8Array(mergedUpdate);
    } else {
        // Jika belum ada data, pakai update baru saja
        finalBlob = new Uint8Array(newUpdate);
    }

    // 3. Simpan hasil gabungan kembali ke DB
    await prisma.document.upsert({
      where: { id: docId },
      update: { content: Buffer.from(finalBlob) },
      create: { id: docId, content: Buffer.from(finalBlob) },
    });

  } catch (e) {
    console.error("Failed to save DB:", e);
  }
}

startServer();