import { google } from 'googleapis';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const form = formidable({});
        const [fields, files] = await form.parse(req);

        const file = files.file?.[0];
        const folderPath = fields.folderPath?.[0] || 'employee-documents';

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        // Parse the service acc ount from environment variable
        let serviceAccount;
        try {
            serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        } catch (error) {
            console.error('Error parsing service account:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Invalid service account configuration' 
            });
        }

        // Initialize Google Drive API
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: serviceAccount.client_email,
                private_key: serviceAccount.private_key.replace(/\\n/g, '\n'),
                client_id: serviceAccount.client_id,
            },
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // Extract folder ID from the URL if provided
        let baseFolderId = process.env.DRIVE_FOLDER_ID;
        if (baseFolderId && baseFolderId.includes('folders/')) {
            // Extract folder ID from Google Drive URL
            const match = baseFolderId.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                baseFolderId = match[1];
            }
        }

        // Create folder structure
        let folderId = baseFolderId || await findOrCreateFolder(drive, folderPath, null);

        // If we have a specific folder path beyond the base folder
        if (folderPath && baseFolderId) {
            folderId = await findOrCreateFolder(drive, folderPath, baseFolderId);
        }

        // Upload file with metadata
        const fileMetadata = {
            name: file.originalFilename,
            parents: [folderId],
        };

        const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.filepath),
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name, mimeType, webViewLink, webContentLink',
        });

        // Make file publicly accessible (optional - for direct downloads)
        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // Generate direct download URL
        const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${response.data.id}`;
        
        // Clean up temp file
        fs.unlinkSync(file.filepath);

        res.status(200).json({
            success: true,
            data: {
                url: directDownloadUrl,
                viewUrl: response.data.webViewLink,
                fileId: response.data.id,
                fileName: response.data.name,
                mimeType: response.data.mimeType,
                directDownloadUrl: directDownloadUrl,
                previewUrl: response.data.webContentLink,
            },
            message: 'File uploaded successfully',
        });

    } catch (error) {
        console.error('Upload error:', error);
        
        // Clean up temp file if it exists
        if (files?.file?.[0]?.filepath && fs.existsSync(files.file[0].filepath)) {
            fs.unlinkSync(files.file[0].filepath);
        }

        res.status(500).json({
            success: false,
            message: 'Upload failed',
            error: error.message || 'Unknown error occurred',
        });
    }
}

async function findOrCreateFolder(drive, folderPath, parentId = null) {
    if (!folderPath) return parentId || 'root';
    
    const folderNames = folderPath.split('/').filter(name => name.trim() !== '');
    let currentParentId = parentId || 'root';

    for (const folderName of folderNames) {
        try {
            // Check if folder already exists
            const response = await drive.files.list({
                q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive',
            });

            let folder = response.data.files?.[0];

            if (!folder) {
                // Create folder if it doesn't exist
                const folderMetadata = {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [currentParentId],
                };

                const createdFolder = await drive.files.create({
                    requestBody: folderMetadata,
                    fields: 'id',
                });

                folder = { id: createdFolder.data.id };
            }

            currentParentId = folder.id;
        } catch (error) {
            console.error(`Error finding/creating folder ${folderName}:`, error);
            throw error;
        }
    }

    return currentParentId;
}
