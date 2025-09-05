import { useState } from 'react';
import './App.css';
import {
  generateAesGcmKey,
  getRandomIv,
  aesGcmEncrypt,
  aesGcmDecrypt,
  sha256,
  arrayBufferToHex,
  hexToArrayBuffer,
  importRsaPublicKeyFromHexSpki,
  importRsaPrivateKeyFromHexPkcs8,
  rsaOaepEncrypt,
  rsaOaepDecrypt,
} from './utils/crypto.js';
import { generateRsaKeyPair } from './utils/keyGenerator.js';
import { savePublicKeyHex, getPublicKeyHex, clearPublicKey } from './utils/keyManagement.js';

function App() {
  const [file, setFile] = useState(null);
  const [view, setView] = useState('encrypt'); // 'encrypt' | 'decrypt' | 'keys'
  const [publicKeyHex, setPublicKeyHex] = useState(getPublicKeyHex());
  const [privateKeyHex, setPrivateKeyHex] = useState('');
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleEncryptAndUpload = async (e) => {
    e.preventDefault();
    setStatus('');
    try {
      if (!file) return alert('Please select a file first');
      if (!publicKeyHex) return alert('Provide RSA public key (HEX SPKI)');

      const publicKey = await importRsaPublicKeyFromHexSpki(publicKeyHex.trim());

      const fileBuffer = await file.arrayBuffer();
      const digest = await sha256(fileBuffer);
      const digestBytes = new Uint8Array(digest);
      const fileBytes = new Uint8Array(fileBuffer);

      // Construct plaintext = digest || file
      const plaintext = new Uint8Array(digestBytes.length + fileBytes.length);
      plaintext.set(digestBytes, 0);
      plaintext.set(fileBytes, digestBytes.length);

      // AES encrypt
      const aesKey = await generateAesGcmKey();
      const iv = getRandomIv();
      const ciphertext = await aesGcmEncrypt(aesKey, plaintext, iv);

      // Export AES raw key to encrypt with RSA
      const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
      const encryptedAesKey = await rsaOaepEncrypt(publicKey, rawAesKey);

      // Prepare payload
      const payload = {
        filename: file.name,
        ivHex: arrayBufferToHex(iv.buffer),
        ciphertextHex: arrayBufferToHex(ciphertext),
        encryptedAesKeyHex: arrayBufferToHex(encryptedAesKey),
        digestHex: arrayBufferToHex(digest),
      };

      const res = await fetch('http://localhost:5000/upload-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Upload failed');
      setStatus('Encrypted file uploaded.');
    } catch (err) {
      console.error(err);
      setStatus('Error: ' + err.message);
    }
  };

  const handleGenerateKeys = async () => {
    setStatus('');
    try {
      const { publicKeySpkiHex, privateKeyPkcs8Hex } = await generateRsaKeyPair();
      setPublicKeyHex(publicKeySpkiHex);
      savePublicKeyHex(publicKeySpkiHex);
      setPrivateKeyHex(privateKeyPkcs8Hex);
    } catch (err) {
      setStatus(`Error generating keys: ${err}`);
    }
  };

  const handleClearPublicKey = () => {
    clearPublicKey();
    setPublicKeyHex('');
  };

  const handleDecrypt = async (e) => {
    e.preventDefault();
    setStatus('');
    try {
      if (!privateKeyHex) return alert('Paste RSA private key (HEX PKCS8)');

      const fileInput = e.target.elements.encfile;
      const encFile = fileInput.files[0];
      if (!encFile) return alert('Select encrypted JSON file');

      const text = await encFile.text();
      const obj = JSON.parse(text);

      const privateKey = await importRsaPrivateKeyFromHexPkcs8(privateKeyHex.trim());

      const iv = new Uint8Array(hexToArrayBuffer(obj.ivHex));
      const ciphertext = hexToArrayBuffer(obj.ciphertextHex);
      const encryptedAesKey = hexToArrayBuffer(obj.encryptedAesKeyHex);
      // digest from server is not required because we verify against decrypted content

      const rawAesKey = await rsaOaepDecrypt(privateKey, encryptedAesKey);
      const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);

      const decrypted = await aesGcmDecrypt(aesKey, ciphertext, iv);
      const decryptedBytes = new Uint8Array(decrypted);

      const digestBytes = decryptedBytes.slice(0, 32);
      const fileBytes = decryptedBytes.slice(32);

      const digestCheck = new Uint8Array(await sha256(fileBytes.buffer));
      const ok = arrayBufferToHex(digestBytes) === arrayBufferToHex(digestCheck);
      if (!ok) throw new Error('Hash verification failed');

      // Offer download of decrypted file
      const blob = new Blob([fileBytes], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = obj.filename || 'decrypted.bin';
      a.click();
      setStatus('Decryption successful. File downloaded.');
    } catch (err) {
      console.error(err);
      setStatus('Error: ' + err.message);
    }
  };

  return (
    <div>
      <div>
        <button onClick={() => setView('encrypt')}>Encrypt & Upload</button>
        <button onClick={() => setView('decrypt')}>Decrypt</button>
        <button onClick={() => setView('keys')}>Keys</button>
      </div>

      {view === 'keys' && (
        <div>
          <div>
            <button onClick={handleGenerateKeys}>Generate RSA Key Pair</button>
          </div>
          <div>
            <div>Public Key (HEX SPKI):</div>
            <textarea rows="6" cols="80" value={publicKeyHex} onChange={(e) => setPublicKeyHex(e.target.value)} />
            <div>
              <button onClick={() => savePublicKeyHex(publicKeyHex)}>Save Public Key</button>
              <button onClick={handleClearPublicKey}>Clear Cached Public Key</button>
            </div>
          </div>
          <div>
            <div>Private Key (HEX PKCS8):</div>
            <textarea rows="6" cols="80" value={privateKeyHex} onChange={(e) => setPrivateKeyHex(e.target.value)} />
            <div>(Not stored)</div>
          </div>
        </div>
      )}

      {view === 'encrypt' && (
        <form onSubmit={handleEncryptAndUpload}>
          <div>
            <div>RSA Public Key (HEX SPKI):</div>
            <textarea rows="4" cols="80" value={publicKeyHex} onChange={(e) => setPublicKeyHex(e.target.value)} />
          </div>
          <div>
            <input type="file" name="file" onChange={handleFileChange} />
          </div>
          <button type="submit">Encrypt & Upload</button>
        </form>
      )}

      {view === 'decrypt' && (
        <form onSubmit={handleDecrypt}>
          <div>
            <div>RSA Private Key (HEX PKCS8):</div>
            <textarea rows="4" cols="80" value={privateKeyHex} onChange={(e) => setPrivateKeyHex(e.target.value)} />
          </div>
          <div>
            <div>Upload encrypted JSON (as downloaded from server):</div>
            <input type="file" name="encfile" accept="application/json" />
          </div>
          <button type="submit">Decrypt</button>
        </form>
      )}

      {status && <div>{status}</div>}
    </div>
  );
}

export default App;
