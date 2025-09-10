import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateRsaKeyPair } from '../utils/keyGenerator.js';
import { toast } from 'react-toastify';
import KeyModal from '../components/KeyModal.jsx';
import './pages.css';

const API_URL = 'http://localhost:5000';

export default function AuthPage({ user, setUser, privateKeyHex, setPrivateKeyHex, status, setStatus }) {
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [lastGeneratedKey, setLastGeneratedKey] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus('Generating RSA key pair...');
    try {
      const { publicKeySpkiHex, privateKeyPkcs8Hex } = await generateRsaKeyPair();
      setStatus('Registering with the server...');

      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password, publicKey: publicKeySpkiHex }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

  // open modal with the generated private key instead of a toast
  setLastGeneratedKey(privateKeyPkcs8Hex);
  setModalOpen(true);
  setMode('login');
  setStatus('Registration successful. Please save your private key.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus('Logging in...');
    try {
      if (!privateKeyHex) return alert('Private key is required to log in and decrypt data.');
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const userData = await res.json();
      setUser(userData);
      setStatus('');
      navigate('/vault');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="page-root">
      <header className="app-header">
        <h1>Secure File Vault</h1>
      </header>
      <main className="app-main">
        {status && <p className="status">{status}</p>}
        {mode === 'login' ? (
          <div className="auth-container">
            <form onSubmit={handleLogin} className="auth-form">
              <h2>Login</h2>
              <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <textarea placeholder="Paste your Private Key (HEX)" value={privateKeyHex} onChange={(e) => setPrivateKeyHex(e.target.value)} required />
              <button type="submit">Login</button>
              <p className="toggle-view">Don't have an account? <button type="button" onClick={() => setMode('register')}>Register</button></p>
            </form>
          </div>
        ) : (
          <div className="auth-container">
            <form onSubmit={handleRegister} className="auth-form">
              <h2>Register</h2>
              <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit">Register</button>
              <p className="toggle-view">Already have an account? <button type="button" onClick={() => setMode('login')}>Login</button></p>
            </form>
          </div>
        )}
      </main>
      <KeyModal open={modalOpen} keyHex={lastGeneratedKey} onClose={(confirmed) => {
        setModalOpen(false);
        if (confirmed) {
          // user confirmed they saved the key
          setLastGeneratedKey('');
          setStatus('Registration complete. You can now log in.');
        } else {
          setStatus('Please save your private key.');
        }
      }} />
    </div>
  );
}
