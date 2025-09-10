import { useEffect, useRef, useState } from 'react';
import './../pages/pages.css';

export default function KeyModal({ open, keyHex, onClose }) {
  const [checked, setChecked] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setChecked(false);
      // focus the confirm checkbox for accessibility
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyHex);
      // small visual confirmation can be handled by caller
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([keyHex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'private_key.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-header">
          <h2>Registration successful!</h2>
          <button className="modal-close" onClick={() => onClose(false)} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <p className="toast-warning">PLEASE SAVE YOUR PRIVATE KEY</p>
          <div className="modal-key-area">
            <textarea
              ref={textareaRef}
              readOnly
              className="modal-key-textarea"
              value={keyHex}
              aria-label="Private key"
            />
          </div>
        </div>

        <div className="modal-footer">
          <label className="modal-checkbox">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            I have saved my private key securely
          </label>

          <div className="modal-actions">
            <button className="btn btn-ghost" type="button" onClick={handleCopy}>Copy</button>
            <button className="btn btn-ghost" type="button" onClick={handleDownload}>Download</button>
            <button className="btn btn-primary" type="button" disabled={!checked} onClick={() => onClose(true)}>Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}
