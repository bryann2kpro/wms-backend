import express from "express";
import ViteExpress from "vite-express";
import path from 'path';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Import Middleware
// import { responseFormatter } from "./middlewares/responseFormatter/index.js";

// Router
import v1Router from "@/router/v1.js";
import { requestLoggerMiddleware } from "./middlewares/request-logger";
import { fileURLToPath } from "url";
import { env } from "./env";

const app = express();

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Allow frontend origins
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Allow all common HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'], // Allow common headers
  optionsSuccessStatus: 200 // For legacy browser support
};

// Global middlewares
app.use(cors(corsOptions)); // Enable CORS with configuration
app.use(helmet()); // For security headers
app.use(requestLoggerMiddleware); // For logging requests (URL, method, IP, user agent, response time)
app.use(express.json()); // For parsing JSON request bodies
app.use(express.urlencoded({ extended: true })); // For parsing URL-encoded request bodies

// Serve static files
// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

// Router
app.use('/api/v1', v1Router);

const PORT = env.PORT || 3000;

ViteExpress.listen(app, Number(PORT), () =>
  console.log(`Server is listening on port ${PORT}...`),
);