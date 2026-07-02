const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const read = (file) => {
  const filePath = path.join(DATA_DIR, file);
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } 
  catch { return []; }
};

const write = (file, data) => {
  const filePath = path.join(DATA_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

module.exports = {
  getUsers: () => read('users.json'),
  saveUsers: (users) => write('users.json', users),
  getHistory: () => read('history.json'),
  saveHistory: (history) => write('history.json', history)
};
