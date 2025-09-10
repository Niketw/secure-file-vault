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
  if (['doc', 'docx', 'csv'].includes(extension)) return '📝';
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
    <div className="space-y-8">
      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload New File</h3>
        <form onSubmit={handleEncryptAndUpload} className="flex flex-wrap items-center gap-4">
          <input
            id="fileUpload"
            type="file"
            className="hidden"
            onChange={(e) => setFileToUpload(e.target.files[0])}
            required
          />
          <label 
            htmlFor="fileUpload" 
            className="bg-gray-100 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500/30 focus:ring-offset-2 transition-colors cursor-pointer"
          >
            Choose File
          </label>
          <span className="text-sm text-gray-600 min-w-40">
            {fileToUpload ? fileToUpload.name : 'No file chosen'}
          </span>
          <button 
            type="submit" 
            className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={!fileToUpload}
          >
            Encrypt & Upload
          </button>
        </form>
      </div>

      {/* Files Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Your Files</h3>
          <button 
            type="button" 
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/30 focus:ring-offset-2 transition-colors" 
            onClick={fetchFiles}
          >
            Refresh Files
          </button>
        </div>
        
        {files.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">No files found. Upload a file to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {files.map((file) => (
              <div 
                key={file.fileId} 
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group" 
                onClick={() => handleDownloadAndDecrypt(file)}
              >
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                  {getFileIcon(file.filename)}
                </div>
                <div className="text-xs text-gray-700 text-center break-all line-clamp-2">
                  {file.filename}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FileView;