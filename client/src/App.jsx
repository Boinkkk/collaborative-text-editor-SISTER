import React from 'react';
import Editor from './Page/Editor.jsx';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Modern Header / Navbar */}
      <header className="bg-white border-b border-slate-200 shadow-sm py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            {/* Ikon Dokumen Sederhana */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-indigo-600">
              <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zM12.75 1.5a.75.75 0 00-.75.75v1.875c0 .414.336.75.75.75h1.875a.75.75 0 00.75-.75V1.5h-2.625z" clipRule="evenodd" />
            </svg>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              Collab<span className="text-indigo-600">Docs</span>
            </h1>
          </div>
          <div>
            {/* Placeholder untuk user profile di masa depan */}
             <span className="text-sm text-slate-500 font-medium">Guest User</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
           <Editor />
        </div>
      </main>
      
      {/* Simple Footer */}
      <footer className="py-4 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} Distributed System Project. Built with React & Tailwind.</p>
      </footer>
    </div>
  );
}

export default App;