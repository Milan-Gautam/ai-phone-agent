const { exec } = require('child_process');

function execute(action, value) {
  return new Promise((resolve) => {
    let command = '';
    
    switch (action) {
      case 'open':
        command = process.platform === 'win32' ? `start ${value}` :
                  process.platform === 'darwin' ? `open "${value}"` :
                  `xdg-open "${value}"`;
        break;
        
      case 'search':
        const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
        command = process.platform === 'win32' ? `start ${url}` : `xdg-open "${url}"`;
        break;
        
      case 'app':
        command = value;
        break;
        
      default:
        resolve('No action needed');
        return;
    }
    
    exec(command, (error) => {
      resolve(error ? `Failed: ${error.message}` : 'Completed successfully');
    });
  });
}

module.exports = { execute };
