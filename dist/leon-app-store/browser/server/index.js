const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'apps.json');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]\n');
}

function resolveWebDir() {
  if (process.env.WEB_DIR) {
    return path.resolve(process.env.WEB_DIR);
  }
  const candidates = [
    path.join(ROOT, '..'),
    path.join(ROOT, '..', 'dist', 'leon-app-store', 'browser'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return candidates[0];
}

const WEB_DIR = resolveWebDir();

function readApps() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeApps(apps) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(apps, null, 2) + '\n');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${file.originalname}`),
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/apps', (req, res) => {
  res.json(readApps());
});

app.post(
  '/api/apps',
  upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'apk', maxCount: 1 },
  ]),
  (req, res) => {
    const { name, version, description } = req.body;
    const icon = req.files?.icon?.[0];
    const apk = req.files?.apk?.[0];

    if (!name || !version || !description || !icon || !apk) {
      return res.status(400).json({
        error: 'name, version, description, icon und apk sind erforderlich.',
      });
    }

    const entry = {
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      name,
      version,
      description,
      iconUrl: `/uploads/${icon.filename}`,
      apkUrl: `/uploads/${apk.filename}`,
      createdAt: new Date().toISOString(),
    };

    const apps = readApps();
    apps.push(entry);
    writeApps(apps);

    res.status(201).json(entry);
  },
);

app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/server', (req, res) => res.status(403).end());

app.use(express.static(WEB_DIR));

app.use((req, res) => {
  if (
    req.method !== 'GET' ||
    req.path.startsWith('/api') ||
    req.path.startsWith('/uploads')
  ) {
    return res.status(404).end();
  }
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Leon AppStore server läuft auf http://localhost:${PORT}`);
  console.log(`Web-Verzeichnis: ${WEB_DIR}`);
});
