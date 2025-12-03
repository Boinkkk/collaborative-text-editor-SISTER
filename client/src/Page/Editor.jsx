import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

const Editor = () => {
  const editorRef = useRef(null);
  // Default status 'connecting' agar indikator kuning muncul di awal
  const [connectionStatus, setConnectionStatus] = useState('connecting'); 

  useEffect(() => {
    const ydoc = new Y.Doc();
    
    // Ganti URL ini nanti saat sudah menjalankan server Nginx+Node
    // Untuk saat ini biarkan localhost:80 (atau ws://localhost:3000 jika test langsung ke node)
    const provider = new WebsocketProvider(
      'ws://localhost:80', 
      'collaborative-document-room', 
      ydoc
    );

    provider.on('status', event => {
      setConnectionStatus(event.status);
    });

    // Konfigurasi Toolbar Quill yang lebih bersih
    const editor = new Quill(editorRef.current, {
      modules: {
        toolbar: [
          [{ header: [1, 2, false] }],
          ['bold', 'italic', 'underline', 'strike'], // Menambahkan strike
          [{ color: [] }, { background: [] }], // Menambahkan warna
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'blockquote', 'code-block'], // Menambahkan link & quote
          ['clean'] // Tombol hapus format
        ]
      },
      placeholder: 'Ketik sesuatu yang menakjubkan di sini...',
      theme: 'snow'
    });

    const binding = new QuillBinding(ydoc.getText('quill'), editor, provider.awareness);

    return () => {
      provider.destroy();
      binding.destroy();
    };
  }, []);

  // Helper untuk menentukan warna status
  const getStatusColor = () => {
    if (connectionStatus === 'connected') return 'bg-green-500';
    if (connectionStatus === 'connecting') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
     if (connectionStatus === 'connected') return 'Online & Synced';
     if (connectionStatus === 'connecting') return 'Connecting...';
     return 'Offline';
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
      
      {/* Editor Header Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <div>
           <input 
             type="text" 
             defaultValue="Untitled Document" 
             className="text-lg font-semibold text-slate-800 border-none focus:ring-0 p-0 bg-transparent placeholder-slate-400 w-full max-w-md"
             placeholder="Document Title"
           />
        </div>
        
        {/* Modern Status Indicator */}
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-full">
          <span className="relative flex h-2.5 w-2.5">
            {connectionStatus !== 'disconnected' && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusColor()}`}></span>
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${getStatusColor()}`}></span>
          </span>
          <span className={`text-xs font-medium ${connectionStatus === 'connected' ? 'text-slate-600' : 'text-slate-500'}`}>
            {getStatusText()}
          </span>
        </div>
      </div>
      
      {/* Area Quill Editor */}
      <div className="bg-slate-50"> {/* Wrapper untuk memberi background abu tipis di belakang editor */}
          <div ref={editorRef} className="bg-white mx-auto" /> 
      </div>
    </div>
  );
};

export default Editor;