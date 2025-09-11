/**
 * Configuration for API endpoints
 * 
 * This file centralizes API configuration to make it easily modifiable
 * Change the SERVER_PORT if needed (e.g., use 5001 on macOS if port 5000 is reserved)
 */

// Server configuration
export const SERVER_HOST = 'localhost';
export const SERVER_PORT = 5001; // Change to 5001 for macOS if needed

// Full API URL constructed from host and port
export const API_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
