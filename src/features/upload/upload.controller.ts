import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';

const publicPath = path.resolve(process.cwd(), 'public');
const uploadsPath = path.join(publicPath, 'uploads');

// Ensure the uploads directory exists
async function ensureUploadsDirectory(): Promise<void> {
  try {
    await fs.access(uploadsPath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(uploadsPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

const storage = multer.diskStorage({
  destination: async (req: Request, file: Express.Multer.File, cb) => {
    await ensureUploadsDirectory();
    cb(null, uploadsPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('image');

export const handleUpload = (req: Request, res: Response): void => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File size is too large. Max size is 5MB.' });
      }
      return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
};

// Function to delete a file (for cleanup if needed)
export const deleteFile = async (filename: string): Promise<boolean> => {
  try {
    await fs.unlink(path.join(uploadsPath, filename));
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};
