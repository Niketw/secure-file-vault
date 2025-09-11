import { useNavigate } from 'react-router-dom';
import FileView from '../FileView.jsx';

export default function VaultPage({ user, setUser, privateKeyHex, setPrivateKeyHex, status, setStatus }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    setUser(null);
    setPrivateKeyHex('');
    setStatus('You have been logged out.');
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-8 h-8 bg-slate-900 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">SecureVault</h1>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <button 
                onClick={handleLogout} 
                className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 focus:ring-offset-2 transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        {/* File View */}
        {user && (
          <div className="max-w-7xl mx-auto">
            <FileView user={user} privateKeyHex={privateKeyHex} setStatus={setStatus} />
          </div>
        )}
      </main>
    </div>
  );
}
