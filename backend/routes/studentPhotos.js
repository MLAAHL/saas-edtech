// Student photographs.
//
// The files live on this server and nowhere else: outside the git repo, so a
// deploy can never stage them and a fresh clone can never lose track of them,
// and off any third-party service. The only other copy is the host's snapshot
// of this disk.
//
// Each upload is resized once, on arrival, into the two sizes the apps
// actually render. The original is discarded — serving a 2 MB camera file into
// a 40-pixel avatar is the one mistake that would make the apps slower.

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const router = express.Router();
const firebaseAuth = require('../middleware/firebaseAuth');

// Deliberately outside the repository. On the server this is /var/www; in
// development it sits beside the checkout rather than inside it, so `git
// status` stays clean either way.
const PHOTO_DIR = process.env.PHOTO_DIR ||
  (process.platform === 'win32'
    ? path.join(path.resolve(__dirname, '..', '..', '..'), 'student-photos')
    : '/var/www/student-photos');

const SIZES = {
  sm: 96,    // attendance lists, admin tables, avatars
  lg: 400    // the parents app profile
};

const MAX_UPLOAD = 12 * 1024 * 1024;   // a raw camera file, before resizing

fs.mkdirSync(PHOTO_DIR, { recursive: true });
console.log('🖼️  Student photos stored in ' + PHOTO_DIR);

// Held in memory: the file is resized and written under a new name, so the
// original never lands on disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are accepted.'));
  }
});

// A random name, never the student ID. A predictable one would let anyone walk
// the ID range and collect every photo in the college.
const newKey = () => crypto.randomBytes(12).toString('hex');

const fileFor = (key, size) => path.join(PHOTO_DIR, `${key}_${size}.jpg`);
const urlFor = (key) => `/photos/${key}`;

async function writeSizes(buffer, key) {
  await Promise.all(Object.entries(SIZES).map(([name, px]) =>
    sharp(buffer)
      .rotate()                                   // honour the camera's orientation tag
      // Centre, not automatic subject detection: the student framed this in the
      // cropper, so the server must not re-decide what matters in the picture.
      .resize(px, px, { fit: 'cover', position: 'center' })
      .jpeg({ quality: name === 'sm' ? 78 : 82, mozjpeg: true })
      .toFile(fileFor(key, name))
  ));
}

async function removeSizes(key) {
  if (!key) return;
  await Promise.all(Object.keys(SIZES).map(name =>
    fsp.unlink(fileFor(key, name)).catch(() => {})
  ));
}

// ---------------------------------------------------------------------------
// PUBLIC — serving the images
// ---------------------------------------------------------------------------
//
// A separate router, mounted outside /api. Two reasons: an <img> tag cannot
// send a bearer token, and the admin list renders hundreds of thumbnails at
// once — under the /api rate limit a single page load would lock the user out.
// The key is random rather than derived from the student, so a URL reaches the
// one photo it names and nothing else.

const publicRouter = express.Router();

// GET /photos/:key?size=sm|lg
publicRouter.get('/:key', async (req, res) => {
  const key = String(req.params.key || '');
  if (!/^[a-f0-9]{24}$/i.test(key)) return res.status(404).end();

  const size = SIZES[req.query.size] ? req.query.size : 'lg';
  const file = fileFor(key, size);

  if (!fs.existsSync(file)) return res.status(404).end();

  // The name is random and the content never changes under it, so this can be
  // cached hard — a replacement photo gets a new name.
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.type('image/jpeg');
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------------------
// SELF-SERVICE — the student sets their own photo from the app
// ---------------------------------------------------------------------------
//
// A separate router on the parent session, and it never takes a student ID
// from the request: the id comes from the signed-in session, so one account
// cannot set or clear another student's photo whatever it sends.

const parentAuth = require('../middleware/parentAuth');
const selfRouter = express.Router();

selfRouter.use(parentAuth);

async function replacePhoto(db, studentID, buffer) {
  const safe = String(studentID).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = { studentID: { $regex: new RegExp(`^${safe}$`, 'i') } };
  const col = db.collection('students');

  const records = await col.find(match, { projection: { photoKey: 1 } }).toArray();
  if (!records.length) return null;

  const key = newKey();
  await writeSizes(buffer, key);

  // The photo belongs to the person, so every enrolment record of theirs gets
  // it — a student in combined classes holds more than one.
  await col.updateMany(match,
    { $set: { photoKey: key, photoUrl: urlFor(key), photoUpdatedAt: new Date() } });

  // Only after the records point at the new file, so a failure never leaves a
  // student pointing at something that has been deleted.
  await Promise.all([...new Set(records.map(r => r.photoKey).filter(Boolean))].map(removeSizes));
  return key;
}

selfRouter.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image received.' });

    const key = await replacePhoto(req.db, req.parentSession.studentID, req.file.buffer);
    if (!key) return res.status(404).json({ success: false, error: 'Student record not found.' });

    res.json({ success: true, photoUrl: urlFor(key) });
  } catch (error) {
    console.error('❌ Photo upload failed:', error.message);
    res.status(500).json({ success: false, error: 'Could not save that photo. Try another image.' });
  }
});

selfRouter.delete('/', async (req, res) => {
  try {
    const safe = String(req.parentSession.studentID).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = { studentID: { $regex: new RegExp(`^${safe}$`, 'i') } };
    const col = req.db.collection('students');

    const record = await col.findOne(match, { projection: { photoKey: 1 } });
    await col.updateMany(match, { $unset: { photoKey: '', photoUrl: '', photoUpdatedAt: '' } });
    await removeSizes(record && record.photoKey);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// ADMIN — everything below needs a signed-in staff account
// ---------------------------------------------------------------------------

router.use(firebaseAuth);

// POST /:studentID  (multipart, field name "photo")
router.post('/:studentID', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image received.' });

    const studentID = String(req.params.studentID || '').trim();
    const col = req.db.collection('students');
    const safe = studentID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const students = await col.find(
      { studentID: { $regex: new RegExp(`^${safe}$`, 'i') } },
      { projection: { studentID: 1, photoKey: 1 } }
    ).toArray();

    if (students.length === 0) {
      return res.status(404).json({ success: false, error: 'No student with that ID.' });
    }

    const key = newKey();
    await writeSizes(req.file.buffer, key);

    // A student can hold several enrolment records for combined classes; the
    // photo belongs to the person, so every record gets it.
    const previous = students.map(s => s.photoKey).filter(Boolean);
    await col.updateMany(
      { studentID: { $regex: new RegExp(`^${safe}$`, 'i') } },
      { $set: { photoKey: key, photoUrl: urlFor(key), photoUpdatedAt: new Date() } }
    );

    // Only once the record points at the new file, so a failure never leaves a
    // student pointing at a photo that is gone.
    await Promise.all([...new Set(previous)].map(removeSizes));

    res.json({ success: true, studentID, photoUrl: urlFor(key), records: students.length });
  } catch (error) {
    console.error('❌ Student photo upload failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:studentID
router.delete('/:studentID', async (req, res) => {
  try {
    const studentID = String(req.params.studentID || '').trim();
    const safe = studentID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const col = req.db.collection('students');

    const student = await col.findOne(
      { studentID: { $regex: new RegExp(`^${safe}$`, 'i') } },
      { projection: { photoKey: 1 } }
    );

    await col.updateMany(
      { studentID: { $regex: new RegExp(`^${safe}$`, 'i') } },
      { $unset: { photoKey: '', photoUrl: '', photoUpdatedAt: '' } }
    );

    await removeSizes(student && student.photoKey);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /status — who has a photo and who does not, for the import screen.
router.get('/', async (req, res) => {
  try {
    const students = await req.db.collection('students')
      .find({ isActive: true },
            { projection: { studentID: 1, name: 1, stream: 1, semester: 1, photoUrl: 1 } })
      .sort({ stream: 1, semester: 1, name: 1 })
      .toArray();

    // One entry per person, not per enrolment record.
    const byId = new Map();
    students.forEach(s => { if (!byId.has(s.studentID)) byId.set(s.studentID, s); });
    const list = [...byId.values()];

    let bytes = 0;
    try {
      const files = await fsp.readdir(PHOTO_DIR);
      for (const f of files) {
        const st = await fsp.stat(path.join(PHOTO_DIR, f)).catch(() => null);
        if (st) bytes += st.size;
      }
    } catch { /* directory may be empty */ }

    res.json({
      success: true,
      students: list,
      withPhoto: list.filter(s => s.photoUrl).length,
      total: list.length,
      diskBytes: bytes,
      storedAt: PHOTO_DIR
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;                      // admin, mounted under /api
module.exports.publicRouter = publicRouter;   // images, mounted at /photos
module.exports.selfRouter = selfRouter;       // the student's own photo
module.exports.PHOTO_DIR = PHOTO_DIR;
