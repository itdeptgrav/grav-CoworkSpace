// lib/vendorCloudinaryUpload.js

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Main upload function
export const uploadToCloudinary = async (file, folder = "vendor-documents") => {
  try {
    // Validate file type - Only images allowed
    const validImageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!validImageTypes.includes(file.type)) {
      throw new Error(
        `Invalid image type. Please upload: ${validImageTypes.join(", ")}`,
      );
    }

    // Check file size (max 10MB for documents, 5MB for profile photos)
    const maxSize = folder.includes("profile")
      ? 5 * 1024 * 1024
      : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(
        `File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      );
    }

    // Create FormData
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", folder);

    const response = await fetch(CLOUDINARY_API_URL, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloudinary error response:", data);
      throw new Error(data.error?.message || "Upload failed");
    }

    return {
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
      format: data.format,
      bytes: data.bytes,
      width: data.width,
      height: data.height,
      originalFilename: data.original_filename,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};

// Specific upload functions for different document types
export const uploadVendorDocument = async (file, documentType) => {
  const folder = `vendor-documents/${documentType}`;
  return uploadToCloudinary(file, folder);
};

export const uploadProfileImage = async (file) => {
  const result = await uploadToCloudinary(file, "vendor-profile-photos");

  // Apply transformations for profile image
  const transformedUrl = getTransformedImageUrl(
    result.url,
    "c_fill,w_500,h_500,q_auto",
  );

  return {
    ...result,
    url: transformedUrl,
  };
};

export const uploadAdditionalDocument = async (file, title) => {
  const folder = "vendor-additional-docs";
  const result = await uploadToCloudinary(file, folder);
  return {
    ...result,
    title,
  };
};

// Helper function to apply transformations to Cloudinary URL
export const getTransformedImageUrl = (url, transformations = "") => {
  if (!url || !url.includes("cloudinary.com") || !transformations) {
    return url;
  }

  try {
    // Insert transformations into Cloudinary URL
    const parts = url.split("/upload/");
    if (parts.length === 2) {
      return `${parts[0]}/upload/${transformations}/${parts[1]}`;
    }
    return url;
  } catch (error) {
    console.error("Error transforming URL:", error);
    return url;
  }
};

// Pre-defined transformation presets
export const TRANSFORMATION_PRESETS = {
  PROFILE_THUMB: "c_fill,w_100,h_100,q_auto",
  PROFILE_MEDIUM: "c_fill,w_250,h_250,q_auto",
  PROFILE_LARGE: "c_fill,w_500,h_500,q_auto",
  DOCUMENT_PREVIEW: "c_limit,w_800,h_800,q_auto",
  ID_CARD: "c_fill,w_300,h_400,q_auto",
};
