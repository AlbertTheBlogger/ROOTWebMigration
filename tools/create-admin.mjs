import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { configureAccounts, hashPassword } from '../backend/server.mjs';

const dbPath=process.env.DB_PATH;
const password=process.env.ADMIN_PASSWORD;
if(!dbPath||typeof password!=='string'||password.length<8||password.length>128)throw new Error('DB_PATH and an 8–128 character ADMIN_PASSWORD are required');
const hash=await hashPassword(password);
const db=new DatabaseSync(resolve(dbPath));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
configureAccounts(db);
db.exec('BEGIN IMMEDIATE');
try{
  let user=db.prepare("SELECT id FROM users WHERE username='admin'").get();
  if(user){
    const member=db.prepare('SELECT owner_id,payload FROM rooms').all().some(room=>room.owner_id===user.id||JSON.parse(room.payload).members.some(member=>member.userId===user.id));
    if(member)throw new Error('The admin account already belongs to a room');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);
  }else{
    user={id:randomUUID()};
    db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(user.id,'admin',hash,Date.now());
  }
  db.prepare("INSERT INTO account_access(user_id,role,disabled) VALUES(?,'admin',0) ON CONFLICT(user_id) DO UPDATE SET role='admin',disabled=0").run(user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  db.exec('COMMIT');
  console.log('Administrator account configured');
}catch(error){db.exec('ROLLBACK');throw error;}
finally{db.close();}
