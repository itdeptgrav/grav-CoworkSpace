// grav-cms/lib/cloudinaryUpload.js

// ─── Image Upload (existing) ──────────────────────────────────────────────────
export const uploadToCloudinary = async (
  file,
  folder = "employee-documents",
) => {
  try {
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

    const maxSize =
      folder === "employee-profile-photos" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(
        `File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      );
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "upload_preset",
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    );
    formData.append("folder", folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData },
    );

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



// Add this to your existing cloudinaryUpload.js file

// ─── Binary/Firmware Upload (for .bin files) ────────────────────────────────
export const uploadFirmwareToCloudinary = async (
  file,
  folder = "barcode-firmware"
) => {
  try {
    // Accept binary files (.bin, .hex, .elf)
    const validTypes = [
      "application/octet-stream",
      "application/x-binary",
      "application/macbinary",
      "application/zip", // sometimes .bin files are detected as zip
    ];

    // Also allow by extension
    const validExtensions = [".bin", ".hex", ".elf", ".ino.bin", ".esp32.bin"];
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!validTypes.includes(file.type) && !hasValidExt) {
      // Don't throw error yet - try to upload anyway as raw
      console.log("File type not recognized, attempting as raw upload anyway");
    }

    const maxSize = 5 * 1024 * 1024; // 5MB max for firmware
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size is 5MB. Your file: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "upload_preset",
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
    );
    formData.append("folder", folder);

    // Important: Use resource_type "raw" for binary files
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/raw/upload`,
      { method: "POST", body: formData }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloudinary firmware upload error:", data);
      throw new Error(data.error?.message || "Firmware upload failed");
    }

    return {
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
      bytes: data.bytes,
      format: data.format || "bin",
      originalFilename: data.original_filename,
    };
  } catch (error) {
    console.error("Firmware upload error:", error);
    throw error;
  }
};




// ─── SVG / Vector Upload ──────────────────────────────────────────────────────
// SVGs must be uploaded as resource_type "raw" because Cloudinary rejects them
// as "image" uploads. We use the /raw/upload endpoint instead.
export const uploadSVGToCloudinary = async (
  file,
  folder = "pattern-grading",
) => {
  try {
    // Accept SVG, AI (application/postscript), EPS
    const validTypes = [
      "image/svg+xml",
      "application/postscript", // .ai / .eps
      "application/illustrator",
      "application/eps",
      "application/x-eps",
      "text/plain", // some SVGs come through as text/plain
    ];

    // Also allow by extension if MIME type is generic
    const validExtensions = [".svg", ".ai", ".eps"];
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext),
    );

    if (!validTypes.includes(file.type) && !hasValidExt) {
      throw new Error("Please upload an SVG, AI, or EPS file.");
    }

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      throw new Error("File too large. Maximum size is 20MB.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "upload_preset",
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    );
    formData.append("folder", folder);
    // resource_type=raw tells Cloudinary to store it as-is without image processing
    // This is the key difference from image uploads

    // NOTE: resource_type is part of the endpoint URL, not the form data
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/raw/upload`,
      { method: "POST", body: formData },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloudinary SVG upload error:", data);
      throw new Error(data.error?.message || "SVG upload failed");
    }

    return {
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
      bytes: data.bytes,
      format: data.format || "svg",
      originalFilename: data.original_filename,
    };
  } catch (error) {
    console.error("SVG upload error:", error);
    throw error;
  }
};

// ─── Profile photo ────────────────────────────────────────────────────────────
export const uploadProfilePhoto = async (file) => {
  const result = await uploadToCloudinary(file, "employee-profile-photos");
  const transformedUrl = getTransformedImageUrl(
    result.url,
    "c_fill,w_500,h_500,q_auto",
  );
  return { ...result, url: transformedUrl };
};

// ─── Document ────────────────────────────────────────────────────────────────
export const uploadDocument = async (file, type = "aadhar") => {
  const folder = `employee-documents/${type}`;
  return uploadToCloudinary(file, folder);
};

// ─── Additional documents ─────────────────────────────────────────────────────
export const uploadAdditionalDocument = async (file, title) => {
  const folder = "employee-additional-docs";
  const result = await uploadToCloudinary(file, folder);
  return { ...result, title };
};

// ─── URL transformation helper ────────────────────────────────────────────────
export const getTransformedImageUrl = (url, transformations = "") => {
  if (!url || !url.includes("cloudinary.com") || !transformations) return url;
  try {
    const parts = url.split("/upload/");
    if (parts.length === 2)
      return `${parts[0]}/upload/${transformations}/${parts[1]}`;
    return url;
  } catch (error) {
    console.error("Error transforming URL:", error);
    return url;
  }
};

export const TRANSFORMATION_PRESETS = {
  PROFILE_THUMB: "c_fill,w_100,h_100,q_auto",
  PROFILE_MEDIUM: "c_fill,w_250,h_250,q_auto",
  PROFILE_LARGE: "c_fill,w_500,h_500,q_auto",
  DOCUMENT_PREVIEW: "c_limit,w_800,h_800,q_auto",
  ID_CARD: "c_fill,w_300,h_400,q_auto",
};
