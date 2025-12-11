import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // Import Routing
import * as Y from 'yjs';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';
import io from 'socket.io-client';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import 'quill/dist/quill.snow.css';

const Editor = ({ user }) => {
  const { id: docId } = useParams(); // Ambil ID Dokumen dari URL
  const navigate = useNavigate();
  const editorRef = useRef(null);
  
  // State UI
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [collaborators, setCollaborators] = useState([]);
  const [docTitle, setDocTitle] = useState('Loading Title...');

  // --- 1. FETCH JUDUL DOKUMEN ---
  useEffect(() => {
    const fetchDocTitle = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`http://localhost:80/api/documents/${docId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setDocTitle(data.title);
        } else {
          setDocTitle("Untitled Document");
        }
      } catch (e) {
        console.error("Failed to fetch title", e);
      }
    };
    fetchDocTitle();
  }, [docId]);

  // --- 2. LOGIKA EDITOR & KOLABORASI ---
  useEffect(() => {
    // Validasi: Jangan jalan jika user belum ada datanya
    if (!user || !user.name) return;

    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    
    // Koneksi Socket
    const socket = io('http://127.0.0.1:80', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    // Helper: Set data diri ke Awareness (PENTING: Pakai data dari props 'user')
    const setLocalAwareness = () => {
       awareness.setLocalStateField('user', {
         name: user.name,  // <-- Dinamis dari DB
         color: user.color // <-- Dinamis dari DB
       });
    };

    // --- SOCKET EVENTS ---
    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join-document', docId); // Join ke room spesifik ID
      setLocalAwareness(); // Kirim data user saat connect
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      setCollaborators([]);
    });

    socket.on('new-user-connected', () => {
       // Kirim ulang identitas kita jika ada user baru masuk
       const myState = encodeAwarenessUpdate(awareness, [awareness.clientID]);
       socket.emit('awareness-update', { docId, update: myState });
    });

    socket.on('load-document', (data) => {
      try {
        const uint8Array = new Uint8Array(data);
        if (uint8Array.byteLength > 0) Y.applyUpdate(ydoc, uint8Array);
      } catch (e) { console.error(e); }
    });

    socket.on('sync-update', (update) => {
      try {
        const uint8Array = new Uint8Array(update);
        if (uint8Array.byteLength > 0) Y.applyUpdate(ydoc, uint8Array);
      } catch (e) { console.error(e); }
    });

    socket.on('awareness-update', (update) => {
      try {
        const uint8Array = new Uint8Array(update);
        if (uint8Array.byteLength > 0) applyAwarenessUpdate(awareness, uint8Array, 'socket');
      } catch (e) { console.error(e); }
    });

    // --- YJS HANDLERS ---
    ydoc.on('update', (update) => {
      socket.emit('sync-update', { docId, update });
    });

    awareness.on('update', ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length > 0) {
        const update = encodeAwarenessUpdate(awareness, changedClients);
        socket.emit('awareness-update', { docId, update });
      }
    });

    awareness.on('change', () => {
      const states = Array.from(awareness.getStates().values());
      const users = states.map(state => state.user).filter(u => u !== undefined);
      // Filter unik berdasarkan nama untuk tampilan sidebar
      const uniqueUsers = Array.from(new Set(users.map(u => u.name)))
        .map(name => users.find(u => u.name === name));
      setCollaborators(uniqueUsers);
    });

    // --- QUILL SETUP ---
    const editor = new Quill(editorRef.current, {
      modules: {
        toolbar: [
          [{ header: [1, 2, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean']
        ]
      },
      placeholder: 'Mulai menulis...',
      theme: 'snow'
    });

    const binding = new QuillBinding(ydoc.getText('quill'), editor, awareness);

    // Heartbeat: Agar status online tidak hilang jika diam lama
    const heartbeatInterval = setInterval(() => {
        if (socket.connected) {
            awareness.setLocalStateField('lastPing', Date.now()); 
        }
    }, 5000);

    return () => {
      clearInterval(heartbeatInterval);
      socket.disconnect();
      binding.destroy();
      ydoc.destroy();
    };
  }, [docId, user]); // PENTING: Jalankan ulang jika ID atau User berubah

  // --- UI HELPER ---
  const getStatusColor = () => {
    if (connectionStatus === 'connected') return 'bg-green-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col h-full">
        {/* Header Editor */}
        <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => navigate('/')} 
                    className="text-slate-500 hover:text-indigo-600 font-medium text-sm flex items-center gap-1"
                >
                    ← Back
                </button>
                <div className="h-6 w-px bg-slate-200"></div>
                <h2 className="text-lg font-bold text-slate-800">{docTitle}</h2>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                    You: {user.name}
                </span>
            </div>
            
            <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${getStatusColor()} animate-pulse`}></span>
                <span className="text-xs font-medium text-slate-500 capitalize">{connectionStatus}</span>
            </div>
        </div>

        {/* Layout Utama: Editor + Sidebar */}
        <div className="flex flex-grow bg-slate-50 p-6 gap-6 overflow-hidden">
            
            {/* Area Editor */}
            <div className="flex-grow flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div ref={editorRef} className="flex-grow overflow-y-auto" />
            </div>

            {/* Sidebar Collaborators */}
            <div className="w-64 flex-shrink-0">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Active Now ({collaborators.length})
                    </h3>
                    <div className="space-y-3">
                        {collaborators.map((collabUser, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <div 
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                                    style={{ backgroundColor: collabUser.color }}
                                >
                                    {collabUser.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-slate-700 truncate">
                                    {collabUser.name}
                                </span>
                            </div>
                        ))}
                        {collaborators.length === 0 && (
                            <p className="text-sm text-slate-400 italic">No one else is here.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Editor;