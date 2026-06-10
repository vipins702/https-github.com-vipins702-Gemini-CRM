import db from './database.js';

const schemas = db.prepare('SELECT * FROM entity_definitions').all();
console.log('\\n=== Schema Lookup Fields ===');
schemas.forEach(s => {
    const config = JSON.parse(s.config);
    const lookupFields = config.fields?.filter(f => f.type === 'lookup' || f.type === 'select') || [];
    console.log(`${s.entity_type}: ${lookupFields.length > 0 ? lookupFields.map(f => f.name + '(' + f.type + ')').join(', ') : 'none'}`);
});

const lookups = db.prepare('SELECT DISTINCT lookup_id FROM lookup_values').all();
console.log('\\n=== Existing Lookups in DB ===');
console.log(lookups.length > 0 ? lookups.map(l => l.lookup_id).join(', ') : 'none');
