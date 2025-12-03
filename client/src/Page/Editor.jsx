import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';
import io from 'socket.io-client';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import 'quill/dist/quill.snow.css';

const DOCUMENT_ID = "skripsi-bab-1";

// Fungsi warna & nama acak
const getRandomColor = () => {
  const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#818cf8', '#e879f9'];
  return colors[Math.floor(Math.random() * colors.length)];
};

const getRandomName = () => {
  const names = ['Kancil', 'Harimau', 'Gajah', 'Panda', 'Koala', 'Kucing', 'Rubah', 'Zebra'];
  return names[Math.floor(Math.random() * names.length)] + ' ' + Math.floor(Math.random() * 100);
};

const Editor = () => {
  const editorRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [collaborators, setCollaborators] = useState([]);
  
  // State user disimpan dalam ref agar konsisten saat re-render
  const currentUser = useRef({
    name: getRandomName(),
    color: getRandomColor()
  });

  useEffect(() => {
    // 1. Inisialisasi Yjs
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    
    // 2. Koneksi Socket (Gunakan 127.0.0.1 agar lebih stabil di Windows)
    const socket = io('http://127.0.0.1:80', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // --- SETUP AWARENESS ---
    // Update data diri lokal di object awareness Yjs
    const setLocalAwareness = () => {
       awareness.setLocalStateField('user', {
         name: currentUser.current.name,
         color: currentUser.current.color
       });
    };

    // --- SOCKET EVENT HANDLERS ---

    socket.on('connect', () => {
      console.log("Connected to WebSocket");
      setConnectionStatus('connected');
      socket.emit('join-document', DOCUMENT_ID);
      setLocalAwareness();
    });

    socket.on('disconnect', () => {
      console.log("Disconnected from WebSocket");
      setConnectionStatus('disconnected');
      setCollaborators([]);
    });

    socket.on('connect_error', (err) => {
      console.error("Connection Error:", err);
      setConnectionStatus('error');
    });

    // A. Sinkronisasi Dokumen
    socket.on('load-document', (data) => {
      try {
        const uint8Array = new Uint8Array(data);
        if (uint8Array.byteLength > 0) Y.applyUpdate(ydoc, uint8Array);
      } catch (e) { console.error("Load Error", e); }
    });

    socket.on('sync-update', (update) => {
      try {
        const uint8Array = new Uint8Array(update);
        if (uint8Array.byteLength > 0) Y.applyUpdate(ydoc, uint8Array);
      } catch (e) { console.error("Sync Error", e); }
    });

    // B. Sinkronisasi Awareness (Collaborators)
    socket.on('awareness-update', (update) => {
      try {
        const uint8Array = new Uint8Array(update);
        if (uint8Array.byteLength > 0) applyAwarenessUpdate(awareness, uint8Array, 'socket');
      } catch (e) { console.error("Awareness Error", e); }
    });

    // --- YJS EVENT LISTENERS ---

    // Saat kita mengetik -> Kirim ke server
    ydoc.on('update', (update) => {
      socket.emit('sync-update', { docId: DOCUMENT_ID, update });
    });

    // Saat awareness lokal berubah -> Kirim ke server
    awareness.on('update', ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length > 0) {
        const update = encodeAwarenessUpdate(awareness, changedClients);
        socket.emit('awareness-update', { docId: DOCUMENT_ID, update });
      }
    });

    // Saat daftar user berubah (Update UI Sidebar)
    awareness.on('change', () => {
      const states = Array.from(awareness.getStates().values());
      const users = states.map(state => state.user).filter(user => user !== undefined);
      // Hapus duplikat user (kadang terjadi saat reconnect)
      const uniqueUsers = Array.from(new Set(users.map(u => u.name)))
        .map(name => users.find(u => u.name === name));
      
      setCollaborators(uniqueUsers);
    });

    // --- QUILL SETUP ---
    const editor = new Quill(editorRef.current, {
      modules: {
        toolbar: [
          [{ header: [1, 2, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean']
        ]
      },
      placeholder: 'Mulai mengetik...',
      theme: 'snow'
    });

    const binding = new QuillBinding(ydoc.getText('quill'), editor, awareness);

    // --- HEARTBEAT MECHANISM (SOLUSI UTAMA) ---
    // Kirim sinyal "Saya Hidup" setiap 5 detik
    // Ini memperbaiki masalah user tidak muncul saat join telat
    const heartbeatInterval = setInterval(() => {
        if (socket.connected) {
            // Paksa update awareness lokal agar ter-trigger event 'update'
            // Yjs otomatis akan menandai user sebagai "offline" jika tidak ada update dlm 30dtk
            // Jadi kita harus "mencolek" nya
            const clientId = awareness.clientID;
            awareness.setLocalStateField('lastPing', Date.now()); 
        }
    }, 5000);

    // --- CLEANUP ---
    return () => {
      clearInterval(heartbeatInterval);
      socket.disconnect();
      binding.destroy();
      ydoc.destroy();
    };
  }, []);

  // UI Helper
  const getStatusColor = () => {
    if (connectionStatus === 'connected') return 'bg-green-500';
    if (connectionStatus === 'error') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  return (
    <div className="flex gap-6 max-w-6xl mx-auto">
      {/* Main Editor */}
      <div className="flex-grow bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        <div className="bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <h2 className="text-lg font-semibold text-slate-800">Skripsi Bab 1</h2>
             <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                You: {currentUser.current.name}
             </span>
          </div>
          
          <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-full">
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${getStatusColor()}`}></span>
            <span className="text-xs font-medium text-slate-500 capitalize">
              {connectionStatus}
            </span>
          </div>
        </div>
        <div className="bg-slate-50">
            <div ref={editorRef} className="bg-white mx-auto" /> 
        </div>
      </div>

      {/* Sidebar Collaborators */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sticky top-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
            Collaborators ({collaborators.length})
          </h3>
          <div className="space-y-3">
            {collaborators.map((user, idx) => (
              <div key={idx} className="flex items-center gap-2 animate-pulse">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0)}
                </div>
                <span className="text-sm font-medium text-slate-700 truncate">
                  {user.name}
                </span>
              </div>
            ))}
            {collaborators.length === 0 && (
              <p className="text-sm text-slate-400 italic">Menunggu user lain...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Editor;