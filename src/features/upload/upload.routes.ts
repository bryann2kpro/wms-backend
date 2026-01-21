
import express from 'express';
import { handleUpload } from './upload.controller.js';

const router = express.Router();

router.post('/', handleUpload);

export default router;