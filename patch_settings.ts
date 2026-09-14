import fs from 'fs';
const FILE = 'src/server/routes/admin/settings.ts';
let code = fs.readFileSync(FILE, 'utf-8');

// Find where settingsRouter.get('/integrations' starts and remove everything until the end of the file except export statement if it's there
const regex = /settingsRouter\.get\('\/integrations'[\s\S]*$/;
code = code.replace(regex, '');
fs.writeFileSync(FILE, code);
