import { useState, useEffect } from 'react';
import './App.css';
import { generateRsaKeyPair } from './utils/keyGenerator.js';
import FileView from './FileView'; // We will create this component next

const API_URL = 'http://localhost:5000';

function App() {
  const [view, setView] = useState('login'); // login, register, vault
  const [user, setUser] = useState(null); // { userId, publicKey }
  const [privateKeyHex, setPrivateKeyHex] = useState('');

  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // App state
  const [status, setStatus] = useState('');

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

      alert(`Registration successful!\n\nPLEASE SAVE YOUR PRIVATE KEY. YOU WILL NOT BE ABLE TO RECOVER IT.\n\n${privateKeyPkcs8Hex}`);
      setView('login');
      setStatus('Registration successful. Please log in.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus('Logging in...');
    try {
      if (!privateKeyHex) {
        return alert('Private key is required to log in and decrypt data.');
      }
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
      setView('vault');
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setPrivateKeyHex('');
    setUsername('');
    setPassword('');
    setView('login');
    setStatus('You have been logged out.');
  };

  const renderLogin = () => (
    <div className="auth-container">
      <form onSubmit={handleLogin} className="auth-form">
        <h2>Login</h2>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <textarea placeholder="Paste your Private Key (HEX)" value={privateKeyHex} onChange={(e) => setPrivateKeyHex(e.target.value)} required />
        <button type="submit">Login</button>
        <p className="toggle-view">Don't have an account? <button type="button" onClick={() => setView('register')}>Register</button></p>
      </form>
    </div>
  );

  const renderRegister = () => (
    <div className="auth-container">
      <form onSubmit={handleRegister} className="auth-form">
        <h2>Register</h2>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">Register</button>
        <p className="toggle-view">Already have an account? <button type="button" onClick={() => setView('login')}>Login</button></p>
      </form>
    </div>
  );

  return (
    <div className="App">
      <header className="app-header">
        <h1>Secure File Vault</h1>
        {user && <button onClick={handleLogout} className="logout-button">Logout</button>}
      </header>
      <main className="app-main">
        {status && <p className="status">{status}</p>}
        {view === 'login' && renderLogin()}
        {view === 'register' && renderRegister()}
        {view === 'vault' && user && <FileView user={user} privateKeyHex={privateKeyHex} setStatus={setStatus} />}
      </main>
    </div>
  );
}

export default App;