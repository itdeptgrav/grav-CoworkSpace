// app/api/cloudinary/upload/route.js
//
// Single upload entry point for the app (MRF product photos, chat
// attachments, employee documents).
//
// Two upload modes, tried in order:
//
//   1. SIGNED   — uses CLOUDINARY_API_SECRET server-side. Preferred: the
//                 secret never reaches the browser and folder/options are
//                 fully under our control.
//   2. UNSIGNED — uses NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET. Needs no secret
//                 at all, because the preset itself carries the permission.
//
// The fallback exists because a wrong or missing API secret fails with
// "Invalid Signature", which blocks every image upload in the product until
// someone notices. An unsigned preset keeps uploads working through that, and
// the moment the secret is corrected the signed path takes over again with no
// code change.

import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

const CLOUD_NAME =
    process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY =
    process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
});

// A Cloudinary API key is ~15 digits; the API secret is a longer alphanumeric
// string. Identical values mean the key was pasted into the secret slot — an
// easy mix-up, since the secret sits behind a reveal button in the console.
// Detect it and skip straight to unsigned rather than spending a round-trip on
// a signature that cannot possibly verify.
const secretLooksWrong =
    !API_SECRET || API_SECRET === API_KEY || /^\d+$/.test(API_SECRET);

function signedUpload(buffer, folder) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'auto' },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });
}

async function unsignedUpload(buffer, folder, filename, mimeType) {
    if (!UPLOAD_PRESET) throw new Error('no unsigned upload preset configured');

    const form = new FormData();
    form.append(
        'file',
        new Blob([buffer], { type: mimeType || 'application/octet-stream' }),
        filename || 'upload'
    );
    form.append('upload_preset', UPLOAD_PRESET);
    if (folder) form.append('folder', folder);

    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: form }
    );
    const data = await res.json();
    if (!res.ok || data.error) {
        throw new Error(data.error?.message || `unsigned upload failed (${res.status})`);
    }
    return data;
}

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const folder = formData.get('folder') || 'employee-documents';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (!CLOUD_NAME) {
            return NextResponse.json(
                { error: 'Upload not configured', details: 'CLOUDINARY_CLOUD_NAME is not set.' },
                { status: 500 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        let result = null;
        let mode = 'signed';
        const problems = [];

        if (secretLooksWrong) {
            problems.push('signed: CLOUDINARY_API_SECRET is missing or is a copy of the API key');
        } else {
            try {
                result = await signedUpload(buffer, folder);
            } catch (err) {
                problems.push(`signed: ${err?.message || err?.error?.message || 'failed'}`);
            }
        }

        if (!result) {
            mode = 'unsigned';
            try {
                result = await unsignedUpload(buffer, folder, file.name, file.type);
            } catch (err) {
                problems.push(`unsigned: ${err.message}`);
                // Both routes are dead — say exactly what to fix rather than
                // returning a bare "Upload failed".
                return NextResponse.json(
                    {
                        error: 'Upload failed',
                        details:
                            `${problems.join(' | ')}. Fix CLOUDINARY_API_SECRET in .env ` +
                            `(reveal it in Cloudinary Console → Settings → API Keys), ` +
                            `or configure an unsigned upload preset.`,
                    },
                    { status: 500 }
                );
            }
            console.warn('[cloudinary] fell back to unsigned upload —', problems.join(' | '));
        }

        return NextResponse.json({
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            size: result.bytes,
            mode,
        });
    } catch (error) {
        console.error('Cloudinary upload API error:', error);
        return NextResponse.json(
            { error: 'Upload failed', details: error.message },
            { status: 500 }
        );
    }
}
