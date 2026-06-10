
import db from './database.js';

const definitions = db.prepare('SELECT * FROM entity_definitions').all();

definitions.forEach(def => {
    console.log(`\nEntity: ${def.entity_type}`);
    const config = JSON.parse(def.config);
    config.fields.forEach(f => {
        if (f.type === 'lookup' || f.name.toLowerCase().includes('customer') || f.name.toLowerCase().includes('account') || f.name.toLowerCase().includes('deal')) {
            console.log(`  Field: ${f.name}, Type: ${f.type}, Label: ${f.label}`);
        }
    });
});
