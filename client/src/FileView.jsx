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

// Helper to handle file type icons (richer and accessible)
// Returns a small JSX span with an emoji (works well cross-platform) and an accessible label.
const getFileIcon = (filename = '') => {
  const name = String(filename || '');
  const parts = name.split('.');
  const extension = parts.length > 1 ? parts.pop().toLowerCase() : '';

  const map = {
    // Documents & Text
    docx: { icon: '📝', label: 'Word document' },
    doc: { icon: '📝', label: 'Word document' },
    pdf: { icon: '📄', label: 'PDF document' },
    txt: { icon: '📄', label: 'Text file' },
    rtf: { icon: '📄', label: 'Rich Text Format' },
    // Images
    jpg: { icon: '🖼️', label: 'Image' },
    jpeg: { icon: '🖼️', label: 'Image' },
    png: { icon: '🖼️', label: 'Image' },
    gif: { icon: '🖼️', label: 'Image' },
    bmp: { icon: '🖼️', label: 'Bitmap image' },
    // Audio
    mp3: { icon: '🎵', label: 'Audio file' },
    wav: { icon: '🔊', label: 'Audio file' },
    m4a: { icon: '🔊', label: 'Audio file' },
    // Video
    mp4: { icon: '🎞️', label: 'Video file' },
    mov: { icon: '🎞️', label: 'Video file' },
    avi: { icon: '🎞️', label: 'Video file' },
    // Spreadsheets & CSV
    xlsx: { icon: '📊', label: 'Spreadsheet' },
    xls: { icon: '�', label: 'Spreadsheet' },
    csv: { icon: '📈', label: 'CSV spreadsheet' },
    // Presentations
    pptx: { icon: '📽️', label: 'Presentation' },
    ppt: { icon: '📽️', label: 'Presentation' },
    // Archives
    zip: { icon: '📦', label: 'Archive' },
    rar: { icon: '📦', label: 'Archive' },
    '7z': { icon: '📦', label: 'Archive' },
    // Executables & System
    exe: { icon: '⚙️', label: 'Executable' },
    msi: { icon: '⚙️', label: 'Windows installer' },
    dll: { icon: '🧩', label: 'Library (DLL)' },
    sys: { icon: '🛠️', label: 'System file' },
    ini: { icon: '⚙️', label: 'Config file' },
  };

  const entry = map[extension];
  const display = entry || { icon: '�', label: 'File' };

  // Return a small span so callers can style it (text-3xl still works)
  return (
    <span role="img" aria-label={display.label} title={display.label}>
      {display.icon}
    </span>
  );
};

function FileView({ user, privateKeyHex, setStatus }) {
  const [files, setFiles] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setFileToUpload(droppedFiles[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setFileToUpload(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload New File</h3>
        <form onSubmit={handleEncryptAndUpload} className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Side - Drag & Drop Area */}
            <div 
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors min-h-[140px] ${
                isDragOver 
                  ? 'border-slate-900 bg-slate-50' 
                  : fileToUpload 
                    ? 'border-green-400 bg-green-50' 
                    : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('fileUpload').click()}
            >
              <input
                id="fileUpload"
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                required
              />
              
              {fileToUpload ? (
                <>
                  <svg className="w-8 h-8 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-green-700">File Selected</p>
                  <p className="text-xs text-green-600 mt-1 truncate max-w-full">{fileToUpload.name}</p>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700">Choose a file or drag it here</p>
                  <p className="text-xs text-gray-500 mt-1">Click to browse or drag and drop</p>
                </>
              )}
            </div>

            {/* Right Side - File Info & Upload Button */}
            <div className="flex flex-col justify-between space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Selected File</label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg min-h-[60px] flex items-center">
                  <div className="w-full">
                    {fileToUpload ? (
                      <>
                        <p className="text-sm font-medium text-gray-900 truncate">{fileToUpload.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(fileToUpload.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No file selected</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button 
                  type="submit" 
                  className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  disabled={!fileToUpload}
                >
                  Encrypt & Upload
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Files Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Your Files</h3>
          <button
            type="button"
            onClick={fetchFiles}
            aria-label="Refresh files"
            title="Refresh files"
            className="inline-flex items-center justify-center w-9 h-9 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-gray-500/30 focus:ring-offset-2 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.36-3.36L23 10" />
              <path d="M20.49 15a9 9 0 01-14.36 3.36L1 14" />
            </svg>
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