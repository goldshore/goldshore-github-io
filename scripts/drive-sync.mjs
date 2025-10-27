import {google} from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DRIVE_FOLDER_ID = process.env.GS_DRIVE_FOLDER_ID; // root folder for specs
const OUT_DIR = 'packages/refs';

if (!DRIVE_FOLDER_ID) {
  console.error('Missing GS_DRIVE_FOLDER_ID'); process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({version:'v3', auth});

const allowMime = new Set([
  'application/pdf','text/plain','text/markdown','application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png','image/jpeg','image/svg+xml','application/json','text/csv'
]);

async function listChildren(folderId){
  const files = [];
  let pageToken = undefined;
  do {
    const {data} = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime,parents),nextPageToken',
      pageToken
    });
    files.push(...(data.files||[]));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadFile(file, outPath){
  await fs.mkdir(path.dirname(outPath), {recursive:true});
  // Google Docs export to markdown; others as-is
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export(
      {fileId:file.id, mimeType:'text/markdown'}, {responseType:'arraybuffer'}
    );
    await fs.writeFile(outPath.replace(/\.gdoc$/,'.md'), Buffer.from(res.data));
    return;
  }
  const res = await drive.files.get(
    {fileId:file.id, alt:'media'}, {responseType:'arraybuffer'}
  );
  await fs.writeFile(outPath, Buffer.from(res.data));
}

function slugify(name){ return name.toLowerCase().replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,''); }

async function walk(folderId, base=''){
  const entries = await listChildren(folderId);
  const index = [];
  for (const f of entries) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      const dir = path.join(base, slugify(f.name));
      const sub = await walk(f.id, dir);
      index.push({type:'dir', name:f.name, slug:dir, children:sub.index, modified:f.modifiedTime});
      continue;
    }
    if (!allowMime.has(f.mimeType)) continue;
    const ext = ({
      'application/pdf':'.pdf', 'text/plain':'.txt', 'text/markdown':'.md',
      'application/json':'.json', 'text/csv':'.csv', 'image/png':'.png',
      'image/jpeg':'.jpg', 'image/svg+xml':'.svg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.xlsx'
    })[f.mimeType] || '';
    const fn = slugify(f.name) + ext;
    const out = path.join(OUT_DIR, base, fn);
    await downloadFile(f, out);
    const buf = await fs.readFile(out);
    const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0,16);
    index.push({type:'file', name:f.name, slug:path.join(base, fn), mime:f.mimeType, sha, modified:f.modifiedTime});
  }
  const indexPath = path.join(OUT_DIR, base, '_index.json');
  await fs.mkdir(path.dirname(indexPath), {recursive:true});
  await fs.writeFile(indexPath, JSON.stringify({index}, null, 2));
  return {index};
}

const result = await walk(DRIVE_FOLDER_ID, '');
await fs.writeFile(path.join(OUT_DIR, '_root.json'), JSON.stringify(result, null, 2));
console.log('✅ Drive sync complete');
