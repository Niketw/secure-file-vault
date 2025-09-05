const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('dotenv').config()

const PORT = process.env.PORT;
const app = express();

app.use(cors()); // Allow CORS for requests from frontend
app.use(express.json({ limit: '50mb' }));

// Create uploads folder if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Test route
app.get('/', (req, res) => {
  res.send('hehe nothing here');
});

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  res.send('File uploaded and stored successfully.');
});

// Accept encrypted JSON payload and store as a file
app.post('/upload-json', (req, res) => {
  try {
    const { filename, ivHex, ciphertextHex, encryptedAesKeyHex, digestHex } = req.body || {};
    if (!filename || !ivHex || !ciphertextHex || !encryptedAesKeyHex || !digestHex) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const safeName = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
    const outPath = path.join(uploadDir, safeName);
    fs.writeFileSync(outPath, JSON.stringify({ filename, ivHex, ciphertextHex, encryptedAesKeyHex, digestHex }, null, 2));
    return res.json({ ok: true, storedAs: safeName });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to store' });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
