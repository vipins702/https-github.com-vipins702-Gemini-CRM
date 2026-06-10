import db from './database.js';

// Clear existing menus to allow reseed
db.prepare('DELETE FROM menus').run();
console.log('Menus cleared! Now run: node seed.js');
