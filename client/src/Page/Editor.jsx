import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';
import io from 'socket.io-client';
import 'quill/dist/quill.snow.css';

// ID Dokumen statis untuk tes (nanti bisa dinamis dari URL)
const DOCUMENT_ID = "skripsi-bab-1"; 

const Editor = () => {
  const editorRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    const ydoc = new Y.Doc();
    
    // 1. Koneksi ke Load Balancer (Port 80) atau Server langsung (Port 3000)
    // Gunakan 'http://localhost:3000' jika menjalankan tanpa Docker dulu
    // Gunakan 'http://localhost:80' jika sudah pakai Docker Compose
    const socket = io('http://localhost:80', {
      transports: ['websocket'], // Paksa pakai websocket agar cepat
      path: '/socket.io' // Sesuaikan dengan path di server
    });

    // --- SETUP SOCKET EVENT ---
    
    socket.on('connect', () => {
      setConnectionStatus('connected');
      // Minta masuk room dokumen
      socket.emit('join-document', DOCUMENT_ID);
    });

    socket.on('disconnect', () => setConnectionStatus('disconnected'));

    // A. Menerima data awal dari DB
    socket.on('load-document', (data) => {
      // Apply update dari DB ke Yjs
      const uint8Array = new Uint8Array(data);
      Y.applyUpdate(ydoc, uint8Array);
    });

    // B. Menerima update dari user lain (via Server/Redis)
    socket.on('sync-update', (update) => {
      const uint8Array = new Uint8Array(update);
      Y.applyUpdate(ydoc, uint8Array);
    });

    // C. Mengirim update kita ke Server
    ydoc.on('update', (update) => {
      socket.emit('sync-update', {
        docId: DOCUMENT_ID,
        update: update // Kirim binary blob
      });
    });

    // --- SETUP EDITOR QUILL ---
    const editor = new Quill(editorRef.current, {
      modules: {
        toolbar: [
          [{ header: [1, 2, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean']
        ]
      },
      placeholder: 'Ketik sesuatu...',
      theme: 'snow'
    });

    const binding = new QuillBinding(ydoc.getText('quill'), editor);

    return () => {
      socket.disconnect();
      binding.destroy();
    };
  }, []);

  // --- UI HELPER ---
  const getStatusColor = () => {
    if (connectionStatus === 'connected') return 'bg-green-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      <div className="bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Skripsi Bab 1</h2>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-full">
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${getStatusColor()}`}></span>
          <span className="text-xs font-medium text-slate-500">
            {connectionStatus === 'connected' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <div className="bg-slate-50">
          <div ref={editorRef} className="bg-white mx-auto" /> 
      </div>
    </div>
  );
};

export default Editor;