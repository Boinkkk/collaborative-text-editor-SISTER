import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaClient } from "@prisma/client";
import {prisma} from "./lib/prisma"
import cors from "cors";
import dotenv from "dotenv";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();

const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const JWT_SECRET = process.env.JWT_SECRET || "rahasia-super-aman";

// --- MIDDLEWARE AUTH ---
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const app = express();
// Konfigurasi CORS Eksplisit
app.use(
  cors({
    origin: [
      "http://localhost:5173", 
      "http://127.0.0.1:5173",
      "http://localhost", 
      "http://127.0.0.1"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);


app.use(express.json());

const server = http.createServer(app);


const pubClient = createClient({ url: `redis://${REDIS_HOST}:6379` });
const subClient = pubClient.duplicate();

// --- API ROUTES (Login/Docs) ---
app.post("/api/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#818cf8', '#e879f9'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, color: randomColor }
    });
    
    const token = jwt.sign({ id: user.id, name: user.name, color: user.color }, JWT_SECRET);
    res.json({ token, user: { name: user.name, color: user.color } });
  } catch (e) {
    res.status(400).json({ error: "Email already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user.id, name: user.name, color: user.color }, JWT_SECRET);
    res.json({ token, user: { name: user.name, color: user.color } });
  } catch (e) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/documents", authenticateToken, async (req: any, res: any) => {
  try {
    const docs = await prisma.document.findMany({
      where: { ownerId: req.user.id },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch docs" });
  }
});

app.post("/api/documents", authenticateToken, async (req: any, res: any) => {
  try {
    const { title } = req.body;
    const ydoc = new Y.Doc();
    const initialContent = Y.encodeStateAsUpdate(ydoc);

    const newDoc = await prisma.document.create({
      data: {
        title: title || "Untitled Document",
        ownerId: req.user.id,
        content: Buffer.from(initialContent)
      }
    });
    res.json(newDoc);
  } catch (e) {
    res.status(500).json({ error: "Failed to create doc" });
  }
});

app.get("/api/documents/:id", authenticateToken, async (req: any, res: any) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id }});
    if(!doc) return res.status(404).json({error: "Not found"});
    res.json(doc);
});


// --- LOGIKA UTAMA SOCKET & DB QUEUE ---

// Map untuk menyimpan antrean proses per Dokumen ID
const docQueues = new Map<string, Promise<void>>();

// Fungsi untuk mengantre update database
function queueDatabaseUpdate(docId: string, update: Uint8Array) {
  // Ambil antrean yang sedang berjalan (atau Promise kosong jika tidak ada)
  const previousTask = docQueues.get(docId) || Promise.resolve();

  // Buat tugas baru yang menunggu tugas sebelumnya selesai
  const nextTask = previousTask.then(async () => {
     await saveToDatabase(docId, update);
  });

  // Update map dengan tugas terbaru
  docQueues.set(docId, nextTask);

  // Bersihkan memori jika sudah selesai
  nextTask.catch((err) => console.error("Queue error:", err));
}

async function saveToDatabase(docId: string, newUpdate: Uint8Array) {
  try {
    // 1. Ambil data TERAKHIR dari DB
    const currentDoc = await prisma.document.findUnique({ 
        where: { id: docId },
        select: { content: true } 
    });

    let finalBlob: Buffer;

    if (currentDoc && currentDoc.content) {
        // 2. Gabungkan data lama + update baru
        const currentUint8 = new Uint8Array(currentDoc.content);
        const mergedUpdate = Y.mergeUpdates([currentUint8, newUpdate]);
        finalBlob = Buffer.from(mergedUpdate);
    } else {
        finalBlob = Buffer.from(newUpdate);
    }

    // 3. Simpan
    await prisma.document.update({
      where: { id: docId },
      data: { content: finalBlob },
    });
    
  } catch (e) {
    console.error(`Failed to save doc ${docId}:`, e);
  }
}

// --- START SERVER ---

async function startServer() {
  await Promise.all([pubClient.connect(), subClient.connect()]);
  console.log(`✅ Connected to Redis at ${REDIS_HOST}`);

  const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://localhost", 
        "http://127.0.0.1"
      ],
    credentials: true,
},
    adapter: createAdapter(pubClient, subClient),
  });

  io.on("connection", (socket) => {
    // console.log(`🔌 Client connected: ${socket.id}`);

    socket.on("join-document", async (docId) => {
      socket.join(docId);
      socket.to(docId).emit("new-user-connected");

      const doc = await prisma.document.findUnique({ where: { id: docId } });
      if (doc) {
        socket.emit("load-document", doc.content);
      }
    });

    socket.on("sync-update", ({ docId, update }) => {
      // 1. Broadcast ke user lain (Cepat)
      socket.to(docId).emit("sync-update", update);

      // 2. Masukkan ke antrean Database (Aman)
      // PERUBAHAN: Pakai queueDatabaseUpdate, bukan saveToDatabase langsung
      queueDatabaseUpdate(docId, update);
    });

    socket.on("awareness-update", ({ docId, update }) => {
      socket.to(docId).emit("awareness-update", update);
    });
  });

  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

startServer();