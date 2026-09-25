import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthRequest, isAdminRole } from '../../middleware/auth.ts';

export const uploadRouter = Router();

// Ensure upload directories exist
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'public', 'uploads');

export const PUBLIC_UPLOADS_DIR = UPLOADS_ROOT;
export const COVERS_DIR = path.join(PUBLIC_UPLOADS_DIR, 'covers');
export const AUDIO_DIR = path.join(PUBLIC_UPLOADS_DIR, 'audio');

export function ensureUploadDirsExist() {
  [PUBLIC_UPLOADS_DIR, COVERS_DIR, AUDIO_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

ensureUploadDirsExist();

// Multer Storage Engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      cb(null, AUDIO_DIR);
    } else {
      cb(null, COVERS_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 30);
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 89999 + 10000)}`;
    cb(null, `${cleanName}_${uniqueSuffix}${ext}`);
  },
});

// File filter for cover images
const imageFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

  if (allowedMimetypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только изображения формата JPG, JPEG, PNG, WebP'));
  }
};

// File filter for audio files
const audioFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExts.includes(ext) || file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только аудиофайлы формата MP3, WAV, FLAC, AAC, OGG'));
  }
};

const coverUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const audioUpload = multer({
  storage,
  fileFilter: audioFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

/**
 * POST /api/upload/cover
 * Upload release cover image
 */
uploadRouter.post('/cover', requireAuth, (req: AuthRequest, res: Response) => {
  coverUpload.single('cover')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Размер обложки не должен превышать 15 МБ' });
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки обложки' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Файл обложки не предоставлен' });
    }

    const relativeUrl = `/uploads/covers/${req.file.filename}`;
    res.json({
      success: true,
      url: relativeUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

/**
 * POST /api/upload/audio
 * Upload track audio file
 */
uploadRouter.post('/audio', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.dbUser?.role !== 'musician' && !isAdminRole(req.dbUser?.role)) {
    return res.status(403).json({ error: 'Загрузка аудиофайлов доступна только музыкантам и администраторам' });
  }

  audioUpload.single('audio')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Размер аудиофайла не должен превышать 100 МБ' });
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки аудиофайла' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Аудиофайл не предоставлен' });
    }

    const relativeUrl = `/uploads/audio/${req.file.filename}`;
    res.json({
      success: true,
      url: relativeUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

/**
 * DELETE /api/upload
 * Delete an uploaded file
 */
uploadRouter.delete('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Некорректный URL файла' });
    }

    const safePath = path.normalize(url.replace('/uploads/', ''));
    if (safePath.includes('..')) {
      return res.status(400).json({ error: 'Недопустимый путь к файлу' });
    }

    const fullPath = path.join(PUBLIC_UPLOADS_DIR, safePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    res.json({ success: true, message: 'Файл успешно удалён' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
