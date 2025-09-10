
const express = require('express');
const { Level } = require('level');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increased limit for metadata

// --- Database Setup ---
const db = new Level('secure-vault-db', { valueEncoding: 'json' });

// --- Storage Setup ---
const storageDir = path.join(__dirname, 'storage');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir);
}

// --- Password Hashing Utilities ---
const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
};

// --- Middleware for Authentication (simple version) ---
const authenticate = async (req, res, next) => {
  const { userId } = req.params;
  try {
    const user = await db.get(`user:${userId}`);
    req.user = user; // Attach user to request
    next();
  } catch (error) {
    if (error.notFound) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- User Management Endpoints ---

app.post('/register', async (req, res) => {
  try {
    const { username, name, password, publicKey } = req.body;
    if (!username || !name || !password || !publicKey) {
      return res.status(400).json({ error: 'Username, name, password, and public key are required' });
    }

    for await (const [key, value] of db.iterator({ gte: 'user:', lte: 'user:~' })) {
      if (value.username === username) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const userId = uuidv4();
    const storageId = uuidv4();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    const user = { userId, username, name, passwordHash, salt, publicKey, storageId };

    await db.put(`user:${userId}`, user);

    const userStorageDir = path.join(storageDir, storageId);
    fs.mkdirSync(userStorageDir, { recursive: true });

    res.status(201).json({ userId });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    let user;
    let userId;
    for await (const [key, value] of db.iterator({ gte: 'user:', lte: 'user:~' })) {
      if (value.username === username) {
        userId = key.split(':')[1];
        user = value;
        break;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordHash = hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ userId, publicKey: user.publicKey });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- File Management Endpoints ---

app.post('/upload/:userId', authenticate, express.raw({ limit: '500mb', type: '*/*' }), async (req, res) => {
  try {
    const { storageId } = req.user;
    const encryptedMetadata = req.headers['x-encrypted-metadata'];

    if (!req.body || req.body.length === 0 || !encryptedMetadata) {
      return res.status(400).json({ error: 'File content and encrypted metadata are required' });
    }

    const fileId = uuidv4();
    const filePath = path.join(storageDir, storageId, `${fileId}.enc`);

    await fs.promises.writeFile(filePath, req.body);

    const fileMetadata = {
      fileId,
      ownerId: req.params.userId,
      encryptedMetadata, // Storing the hex string of the encrypted metadata
      createdAt: new Date().toISOString(),
    };

    await db.put(`file:${req.params.userId}:${fileId}`, fileMetadata);

    res.status(201).json({ fileId });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/files/:userId', authenticate, async (req, res) => {
  try {
    const files = [];
    const prefix = `file:${req.params.userId}:`;
    for await (const [key, value] of db.iterator({ gte: prefix, lte: `${prefix}~` })) {
      files.push({ fileId: value.fileId, encryptedMetadata: value.encryptedMetadata });
    }
    res.json(files);
  } catch (error) {
    console.error('Failed to list files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/download/:userId/:fileId', authenticate, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { storageId } = req.user;

    const metadataKey = `file:${req.params.userId}:${fileId}`;
    await db.get(metadataKey); // Check if file metadata exists and belongs to user

    const filePath = path.join(storageDir, storageId, `${fileId}.enc`);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/octet-stream');
      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    if (error.notFound) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    console.error('Download failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
