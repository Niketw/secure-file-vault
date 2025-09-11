# Secure File Vault

![License](https://img.shields.io/github/license/RickyTheDude/secure-file-vault)

A full-stack application for secure, end-to-end encrypted file storage with client-side encryption and key management.

## Overview

Secure File Vault is designed to provide maximum security for your files through client-side encryption. Files are encrypted in the browser before being sent to the server, ensuring that even the server operator cannot access your files' contents. The system uses modern cryptography techniques including RSA and AES-GCM encryption.

![Secure File Vault Screenshot](client/src/assets/background_auth.png)

## Key Features

- **End-to-End Encryption**: Files are encrypted in the browser before upload
- **Zero-Knowledge Design**: The server never sees unencrypted files or encryption keys
- **RSA & AES Hybrid Encryption**: Uses RSA for key exchange and AES-GCM for file content
- **User Authentication**: Secure login/registration system with password hashing
- **File Management**: Upload, download, and manage your encrypted files
- **Responsive UI**: Modern interface built with React and Tailwind CSS

## Architecture

The application consists of two main components:

1. **Frontend (React/Vite)**: Handles user interface, authentication, and encryption/decryption
2. **Backend (Node.js/Express)**: Manages user accounts and stores encrypted files

## Security Features

- **Client-side Encryption**: All encryption/decryption happens in the browser
- **Key Management**: Private keys can be exported and saved locally
- **Password Hashing**: PBKDF2 with strong salting for password security
- **No Plain-text Storage**: Only encrypted data is transmitted and stored

## Getting Started

### Prerequisites

- Node.js v22.12+ and npm
- Modern web browser with Web Cryptography API support

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/RickyTheDude/secure-file-vault.git
   cd secure-file-vault
   ```

2. Install dependencies for both client and server:
   ```bash
   # Install server dependencies
   cd server
   npm install
   
   # Install client dependencies
   cd ../client
   npm install
   ```

3. Configure port settings if needed (especially for macOS users):
   - Edit `server/config.js` to change the server port
   - Edit `client/src/config/apiConfig.js` to match the server port

### Running the Application

1. Start the server:
   ```bash
   cd server
   node server.js
   ```

2. In a new terminal, start the client:
   ```bash
   cd client
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Registration**: Create an account and securely save your private key
2. **Login**: Authenticate with your username, password, and import your private key
3. **File Management**: Upload files which are automatically encrypted
4. **Download**: Files are automatically decrypted when downloaded

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


## Acknowledgements

- Web Cryptography API
- React.js
- Node.js
- LevelDB
- Tailwind CSS
