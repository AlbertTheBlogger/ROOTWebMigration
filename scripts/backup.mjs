import { DatabaseSync } from 'node:sqlite';
import { existsSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
const source=resolve(process.env.DB_PATH||'data/root.sqlite');
if(!existsSync(source))throw new Error('Database does not exist');
const target=resolve(process.argv[2]||`data/backups/root-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
if(existsSync(target)||target===source)throw new Error('Backup destination must be a new file');
mkdirSync(dirname(target),{recursive:true});
const db=new DatabaseSync(source);
try{db.prepare('VACUUM INTO ?').run(target);console.log(`Backup created: ${target}`);}finally{db.close();}
