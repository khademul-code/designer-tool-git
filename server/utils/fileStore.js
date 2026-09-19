/**
 * fileStore.js
 * 
 * Safe JSON file reading and writing utility.
 * Handles parsing, serialization, and directory creation.
 */

const fs = require('fs');
const path = require('path');

/**
 * Reads and parses a JSON file.
 * If the file does not exist, returns the provided defaultValue.
 * 
 * @param {string} filePath - Absolute path to the JSON file
 * @param {any} defaultValue - Default fallback value if file is missing
 * @returns {any} Parsed JSON data
 */
function readJsonFile(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[fileStore] Error reading JSON from ${filePath}:`, err.message);
    return defaultValue;
  }
}

/**
 * Writes data to a JSON file safely with indentation.
 * Automatically creates parent directories if needed.
 * 
 * @param {string} filePath - Absolute path to the JSON file
 * @param {any} data - Data to serialize and write
 * @returns {boolean} True if write succeeded, false otherwise
 */
function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[fileStore] Error writing JSON to ${filePath}:`, err.message);
    return false;
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile
};
