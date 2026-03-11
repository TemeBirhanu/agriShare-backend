import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        let folderName = "agrishare_assets";
        let resourceType = "image"; // default to image

        // Check if it's a document (PDF)
        if (file.mimetype === "application/pdf") {
            folderName = "agrishare_documents";
            resourceType = "raw"; // Cloudinary uses 'raw' for PDFs/Docs
        }

        return {
            folder: folderName,
            resource_type: resourceType,
            allowed_formats: ["jpg", "png", "jpeg", "webp", "pdf"], // Allowed formats
        };
    },
});

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});
