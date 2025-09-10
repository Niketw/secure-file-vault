import { useNavigate } from 'react-router-dom';
import FileView from '../FileView.jsx';
import './pages.css';

export default function VaultPage({ user, setUser, privateKeyHex, setPrivateKeyHex, status, setStatus }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    setUser(null);
    setPrivateKeyHex('');
    setStatus('You have been logged out.');
    navigate('/auth');
  };

  return (
    <div className="page-root">
      <header className="app-header">
        <h1>Secure File Vault</h1>
        {user && <button onClick={handleLogout} className="logout-button">Logout</button>}
      </header>
      <main className="app-main">
        {status && <p className="status">{status}</p>}
        {user && <FileView user={user} privateKeyHex={privateKeyHex} setStatus={setStatus} />}
      </main>
    </div>
  );
}
