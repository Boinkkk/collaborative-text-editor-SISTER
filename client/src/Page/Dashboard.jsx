import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = ({ user, onLogout }) => {
  const [documents, setDocuments] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:80/api/documents', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      setDocuments(await res.json());
    }
  };

  const createDocument = async () => {
    const title = prompt("Enter document title:");
    if (!title) return;

    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:80/api/documents', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title })
    });

    if (res.ok) {
      const newDoc = await res.json();
      // Pindah ke halaman editor dengan ID baru
      navigate(`/doc/${newDoc.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="font-bold text-xl text-indigo-600">CollabDocs Dashboard</h1>
        <div className="flex gap-4 items-center">
          <span className="text-slate-600">Hi, {user.name}</span>
          <button onClick={onLogout} className="text-red-500 hover:underline">Logout</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto py-10 px-6">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Your Documents</h2>
          <button 
            onClick={createDocument}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            + New Document
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {documents.map(doc => (
            <div 
              key={doc.id}
              onClick={() => navigate(`/doc/${doc.id}`)}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition"
            >
              <h3 className="font-bold text-lg text-slate-800 mb-2 truncate">{doc.title}</h3>
              <p className="text-xs text-slate-400">Created: {new Date(doc.createdAt).toLocaleDateString()}</p>
            </div>
          ))}

          {documents.length === 0 && (
            <p className="col-span-3 text-center text-slate-400 py-10">
              You don't have any documents yet. Create one!
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;