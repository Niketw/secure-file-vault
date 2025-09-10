import { useState, useEffect } from 'react';
import {
  generateAesGcmKey,
  getRandomIv,
  aesGcmEncrypt,
  aesGcmDecrypt,
  arrayBufferToHex,
  hexToArrayBuffer,
  importRsaPublicKeyFromHexSpki,
  importRsaPrivateKeyFromHexPkcs8,
  rsaOaepEncrypt,
  rsaOaepDecrypt,
} from './utils/crypto.js';

const API_URL = 'http://localhost:5000';

// Helper to handle file type icons (basic version)
const getFileIcon = (filename = '') => {
  const extension = filename.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) return '🖼️';
  if (['pdf'].includes(extension)) return '📄';
  if (['doc', 'docx'].includes(extension)) return '📝';
  if (['zip', 'rar', '7z'].includes(extension)) return '📦';
  return '📁';
};

function FileView({ user, privateKeyHex, setStatus }) {
  const [files, setFiles] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    if (!user) return;
    setStatus('Fetching files...');
    try {
      const res = await fetch(`${API_URL}/files/${user.userId}`);
      if (!res.ok) throw new Error('Failed to fetch files');
      const fileList = await res.json();

      const privateKey = await importRsaPrivateKeyFromHexPkcs8(privateKeyHex);
      const decryptedFiles = await Promise.all(fileList.map(async (file) => {
        try {
          console.log('Received encryptedKey:', file.encryptedKey);
          console.log('Received encryptedMetadata:', file.encryptedMetadata);
          const rawAesKey = await rsaOaepDecrypt(privateKey, hexToArrayBuffer(file.encryptedKey));
          const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);
          
          const fullEncryptedMetadata = hexToArrayBuffer(file.encryptedMetadata);
          const metadataIv = fullEncryptedMetadata.slice(0, 12);
          const encryptedMetadataBytes = fullEncryptedMetadata.slice(12);

          const metadataBuffer = await aesGcmDecrypt(aesKey, encryptedMetadataBytes, metadataIv);
          const metadata = JSON.parse(new TextDecoder().decode(metadataBuffer));
          return { ...file, ...metadata };
        } catch (e) {
          console.error('Failed to decrypt file metadata:', e);
          return { ...file, filename: '[Decryption Error]' };
        }
      }));

      setFiles(decryptedFiles);
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleEncryptAndUpload = async (e) => {
    e.preventDefault();
    if (!fileToUpload) return alert('Please select a file');
    setStatus('Encrypting file and metadata...');
    try {
      const publicKey = await importRsaPublicKeyFromHexSpki(user.publicKey);
      const fileBuffer = await fileToUpload.arrayBuffer();

      const aesKey = await generateAesGcmKey();

      // 1. Encrypt metadata with its own IV
      const metadataIv = getRandomIv();
      const metadata = JSON.stringify({ filename: fileToUpload.name, type: fileToUpload.type });
      const encryptedMetadataBytes = await aesGcmEncrypt(aesKey, new TextEncoder().encode(metadata), metadataIv);
      const fullEncryptedMetadata = new Uint8Array(metadataIv.length + encryptedMetadataBytes.byteLength);
      fullEncryptedMetadata.set(metadataIv, 0);
      fullEncryptedMetadata.set(new Uint8Array(encryptedMetadataBytes), metadataIv.length);

      // 2. Encrypt file content with its own IV
      const fileIv = getRandomIv();
      const encryptedFileContent = await aesGcmEncrypt(aesKey, fileBuffer, fileIv);
      const payload = new Uint8Array(fileIv.length + encryptedFileContent.byteLength);
      payload.set(fileIv, 0);
      payload.set(new Uint8Array(encryptedFileContent), fileIv.length);

      // 3. Encrypt the AES key
      const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
      const encryptedAesKey = await rsaOaepEncrypt(publicKey, rawAesKey);

      const encryptedKeyHex = arrayBufferToHex(encryptedAesKey);
      const encryptedMetadataHex = arrayBufferToHex(fullEncryptedMetadata);
      console.log('Sending X-Encrypted-Key:', encryptedKeyHex);
      console.log('Sending X-Encrypted-Metadata:', encryptedMetadataHex);

      setStatus('Uploading file...');
      const res = await fetch(`${API_URL}/file/${user.userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Encrypted-Key': encryptedKeyHex,
          'X-Encrypted-Metadata': encryptedMetadataHex,
        },
        body: payload,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      setStatus('File uploaded successfully.');
      fetchFiles();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleDownloadAndDecrypt = async (file) => {
    if (file.filename === '[Decryption Error]') return alert('Cannot download file with decryption error.');
    setStatus(`Downloading ${file.filename}...`);
    try {
      const res = await fetch(`${API_URL}/file/${file.fileId}`);
      if (!res.ok) throw new Error('Download failed');

      const privateKey = await importRsaPrivateKeyFromHexPkcs8(privateKeyHex);
      const rawAesKey = await rsaOaepDecrypt(privateKey, hexToArrayBuffer(file.encryptedKey));
      const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);

      const encFileBuffer = await res.arrayBuffer();
      const fileIv = encFileBuffer.slice(0, 12);
      const ciphertext = encFileBuffer.slice(12);

      setStatus(`Decrypting ${file.filename}...`);
      const decryptedFileBytes = await aesGcmDecrypt(aesKey, ciphertext, fileIv);

      const blob = new Blob([decryptedFileBytes], { type: file.type || 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.filename;
      a.click();
      setStatus(`${file.filename} downloaded and decrypted.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="vault-container">
      <div className="upload-section">
        <h3>Upload New File</h3>
        <form onSubmit={handleEncryptAndUpload}>
          <input type="file" onChange={(e) => setFileToUpload(e.target.files[0])} required />
          <button type="submit">Encrypt & Upload</button>
        </form>
      </div>

      <div className="file-list-section">
        <h3>Your Files</h3>
        <button onClick={fetchFiles}>Refresh Files</button>
        <div className="file-grid">
          {files.length === 0 ? (
            <p>No files found. Upload a file to get started.</p>
          ) : (
            files.map((file) => (
              <div key={file.fileId} className="file-item" onClick={() => handleDownloadAndDecrypt(file)}>
                <div className="file-icon">{getFileIcon(file.filename)}</div>
                <div className="file-name">{file.filename}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default FileView;