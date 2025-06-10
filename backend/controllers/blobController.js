// controllers/blobController.js - ENHANCED VERSION WITH PROFILE IMAGE SUPPORT
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
const { blobServiceClient } = require("../config/azure-storage");
const { pool, sql } = require("../config/database");
const multer = require("multer");
const rtfConversionService = require("../services/rtfConversionService");
const sharp = require("sharp"); // Add this dependency for image processing

// Configure multer
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for RTF files and images
  },
});

// Standard profile image dimensions
const PROFILE_IMAGE_CONFIG = {
  width: 150,
  height: 150,
  quality: 85,
  format: "jpeg",
  standardName: "patient-profile.jpg",
};

// Helper function to check if file is an image
const isImageFile = (filename, mimetype) => {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
  const imageMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/webp",
  ];

  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  return imageExtensions.includes(ext) || imageMimeTypes.includes(mimetype);
};

// Helper function to process profile image
const processProfileImage = async (buffer, originalName) => {
  try {
    // Process image to standard dimensions
    const processedBuffer = await sharp(buffer)
      .resize(PROFILE_IMAGE_CONFIG.width, PROFILE_IMAGE_CONFIG.height, {
        fit: "cover",
        position: "center",
      })
      .jpeg({
        quality: PROFILE_IMAGE_CONFIG.quality,
        progressive: true,
      })
      .toBuffer();

    return {
      buffer: processedBuffer,
      filename: PROFILE_IMAGE_CONFIG.standardName,
      contentType: "image/jpeg",
      originalName: originalName,
    };
  } catch (error) {
    throw new Error(`Failed to process profile image: ${error.message}`);
  }
};

// File operation logging (existing function - no changes)
const logFileOperation = async (
  userId,
  containerName,
  folderName,
  blobName,
  operation
) => {
  try {
    await pool.connect();
    await pool
      .request()
      .input("userId", userId)
      .input("containerName", containerName)
      .input("folderName", folderName)
      .input("blobName", blobName)
      .input("operation", operation).query(`
        INSERT INTO FileAudit (userId, containerName, folderName, blobName, operation)
        VALUES (@userId, @containerName, @folderName, @blobName, @operation)
      `);
  } catch (err) {
    console.error("Error logging file operation:", err.message);
    // Don't throw - this is non-critical
  }
};

// Check user access (existing function - no changes)
const checkUserAccess = async (userId, containerName, folderName) => {
  try {
    await pool.connect();

    const userResult = await pool
      .request()
      .input("id", userId)
      .query("SELECT role FROM Users WHERE userId = @id");

    if (userResult.recordset.length === 0) {
      return false;
    }

    const userRole = userResult.recordset[0].role;

    if (userRole === "admin") {
      return true;
    }

    const containerResult = await pool
      .request()
      .input("userId", userId)
      .input("containerName", containerName)
      .query(
        "SELECT * FROM ContainerAssignments WHERE userId = @userId AND containerName = @containerName"
      );

    if (containerResult.recordset.length === 0) {
      return false;
    }

    if (folderName) {
      const folderResult = await pool
        .request()
        .input("userId", userId)
        .input("containerName", containerName)
        .input("folderName", folderName)
        .query(
          "SELECT * FROM FolderAssignments WHERE userId = @userId AND containerName = @containerName AND folderName = @folderName"
        );

      if (folderResult.recordset.length === 0) {
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("Access check error:", err.message);
    return false;
  }
};

// @route   GET api/blobs/:containerName/:folderName
// @desc    Get all blobs in a folder (TXT files only, no RTF files shown) + Profile Image Check
// @access  Private
exports.getBlobs = async (req, res) => {
  try {
    const { containerName, folderName } = req.params;

    const hasAccess = await checkUserAccess(
      req.user.userId,
      containerName,
      folderName
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    const blobs = [];
    let hasProfileImage = false;
    const folderPrefix = `${folderName}/`;
    const blobIterator = containerClient.listBlobsFlat({
      prefix: folderPrefix,
    });

    for await (const blob of blobIterator) {
      if (blob.name === folderPrefix) {
        continue;
      }

      const blobName = blob.name.replace(folderPrefix, "");

      // Check for profile image
      if (blobName === PROFILE_IMAGE_CONFIG.standardName) {
        hasProfileImage = true;
        // Include profile image in the list for admin viewing
        blobs.push({
          name: blobName,
          fullPath: blob.name,
          contentType: blob.properties.contentType,
          contentLength: blob.properties.contentLength,
          createdOn: blob.properties.createdOn,
          lastModified: blob.properties.lastModified,
          metadata: blob.metadata,
          isProfileImage: true,
        });
        continue;
      }

      // SKIP RTF files - only show TXT and other files
      if (blobName.toLowerCase().endsWith(".rtf")) {
        continue; // Don't include RTF files in the response
      }

      // Check if this is a TXT file converted from RTF
      let isConvertedFromRtf = false;
      let originalRtfFileName = null;
      if (
        blobName.toLowerCase().endsWith(".txt") &&
        blob.metadata?.originalRtfFileName
      ) {
        isConvertedFromRtf = true;
        originalRtfFileName = blob.metadata.originalRtfFileName;
      }

      blobs.push({
        name: blobName,
        fullPath: blob.name,
        contentType: blob.properties.contentType,
        contentLength: blob.properties.contentLength,
        createdOn: blob.properties.createdOn,
        lastModified: blob.properties.lastModified,
        metadata: blob.metadata,
        isConvertedFromRtf,
        originalRtfFileName,
        isProfileImage: false,
      });
    }

    await logFileOperation(
      req.user.userId,
      containerName,
      folderName,
      "FOLDER_LISTING",
      "LIST"
    );

    res.json({
      success: true,
      containerName,
      folderName,
      blobs,
      hasProfileImage, // Add this flag for UI
    });
  } catch (err) {
    console.error("getBlobs error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/blobs/:containerName/:folderName/profile-image
// @desc    Get patient profile image (for emergency access)
// @access  Public (no auth required for emergency access)
exports.getProfileImage = async (req, res) => {
  try {
    const { containerName, folderName } = req.params;

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const containerExists = await containerClient.exists();

    if (!containerExists) {
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    const profileImagePath = `${folderName}/${PROFILE_IMAGE_CONFIG.standardName}`;
    const blobClient = containerClient.getBlobClient(profileImagePath);
    const blobExists = await blobClient.exists();

    if (!blobExists) {
      return res.status(404).json({
        success: false,
        message: "Profile image not found",
      });
    }

    // Get blob properties and content
    const properties = await blobClient.getProperties();
    const downloadResponse = await blobClient.download();

    // Set headers for image display
    res.setHeader("Content-Type", properties.contentType || "image/jpeg");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=300"); // 5 minutes cache
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Log the profile image access
    await logFileOperation(
      0, // System access for emergency
      containerName,
      folderName,
      PROFILE_IMAGE_CONFIG.standardName,
      "PROFILE_VIEW_EMERGENCY"
    );

    // Stream the image content
    downloadResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error("getProfileImage error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/blobs/:containerName/:folderName/:blobName/view
// @desc    View file content directly in new tab
// @access  Private (authenticated by middleware)
exports.viewBlob = async (req, res) => {
  try {
    const { containerName, folderName, blobName } = req.params;

    // User is already authenticated by middleware
    const user = req.user;

    // Check user access
    const hasAccess = await checkUserAccess(
      req.user.userId,
      containerName,
      folderName
    );

    if (!hasAccess) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Access Denied</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
              text-align: center; 
              padding: 20px; 
              background: #f5f5f5; 
              margin: 0;
            }
            .error-box { 
              background: white; 
              border-radius: 8px; 
              padding: 2rem; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
              max-width: 400px; 
              margin: 0 auto; 
            }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>Access Denied</h1>
            <p>You don't have permission to view this file.</p>
          </div>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.focus();
                window.close();
              } else {
                window.history.back();
              }
            }, 3000);
          </script>
        </body>
        </html>
      `);
    }

    // Get the file from Azure Storage
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const containerExists = await containerClient.exists();

    if (!containerExists) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Container Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 20px; background: #f5f5f5; margin: 0;">
          <h1>Container Not Found</h1>
          <p>The requested container does not exist.</p>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.focus();
                window.close();
              } else {
                window.history.back();
              }
            }, 3000);
          </script>
        </body>
        </html>
      `);
    }

    const fullBlobName = `${folderName}/${blobName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);
    const blobExists = await blobClient.exists();

    if (!blobExists) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>File Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 20px; background: #f5f5f5; margin: 0;">
          <h1>File Not Found</h1>
          <p>The requested file does not exist.</p>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.focus();
                window.close();
              } else {
                window.history.back();
              }
            }, 3000);
          </script>
        </body>
        </html>
      `);
    }

    // Get blob properties and content
    const properties = await blobClient.getProperties();
    const contentType = properties.contentType || "application/octet-stream";
    const downloadResponse = await blobClient.download();

    // Set secure headers for viewing only
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    // Universal CSP for all browsers
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline';"
    );

    // Special handling for different file types
    if (contentType.includes("pdf")) {
      res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    }

    if (contentType.includes("image")) {
      res.setHeader("Content-Disposition", "inline");
    }

    // Add headers for converted TXT files
    if (
      contentType.includes("text") &&
      properties.metadata?.originalRtfFileName
    ) {
      res.setHeader("X-Converted-From", "RTF");
      res.setHeader(
        "X-Original-RTF-File",
        properties.metadata.originalRtfFileName
      );
      res.setHeader(
        "X-Conversion-Method",
        properties.metadata.conversionMethod || "cloudconvert"
      );
    }

    // Add headers for profile images
    if (blobName === PROFILE_IMAGE_CONFIG.standardName) {
      res.setHeader("X-File-Type", "profile-image");
      res.setHeader(
        "X-Image-Dimensions",
        `${PROFILE_IMAGE_CONFIG.width}x${PROFILE_IMAGE_CONFIG.height}`
      );
    }

    // Add security indicator headers
    if (req.isFileAccess) {
      res.setHeader("X-Access-Type", "temporary");
      res.setHeader("X-Link-Expires", "5min");
    } else {
      res.setHeader("X-Access-Type", "session");
    }

    // Log the view operation
    await logFileOperation(
      req.user.userId,
      containerName,
      folderName,
      blobName,
      blobName === PROFILE_IMAGE_CONFIG.standardName ? "PROFILE_VIEW" : "VIEW"
    );

    // Stream the file content
    downloadResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error("viewBlob error:", err.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: #f5f5f5; 
            margin: 0;
          }
          .error-box { 
            background: white; 
            border-radius: 8px; 
            padding: 2rem; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            max-width: 400px; 
            margin: 0 auto; 
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>Server Error</h1>
          <p>An error occurred while processing your request.</p>
          <p><small>Error: ${err.message}</small></p>
        </div>
        <script>
          setTimeout(() => {
            if (window.opener) {
              window.opener.focus();
              window.close();
            } else {
              window.history.back();
            }
          }, 3000);
        </script>
      </body>
      </html>
    `);
  }
};

// @route   GET api/blobs/:containerName/:folderName/:blobName/url
// @desc    Get SAS URL for a blob (returns view URL)
// @access  Private (authenticated by middleware)
exports.getBlobSasUrl = async (req, res) => {
  try {
    const { containerName, folderName, blobName } = req.params;

    const hasAccess = await checkUserAccess(
      req.user.userId,
      containerName,
      folderName
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const viewUrl = `/api/blobs/${containerName}/${folderName}/${encodeURIComponent(
      blobName
    )}/view`;

    res.json({
      success: true,
      viewUrl,
      viewOnly: true,
      canModify: req.user.role === "admin",
      canUpload: ["admin", "doctor", "nurse"].includes(req.user.role),
      isProfileImage: blobName === PROFILE_IMAGE_CONFIG.standardName,
      message: "Use viewUrl for secure new tab viewing",
    });
  } catch (err) {
    console.error("getBlobSasUrl error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   POST api/blobs/:containerName/:folderName
// @desc    Upload a blob - RTF files are converted to TXT only, Images processed for profile
// @access  Private/Admin,Doctor,Nurse (authenticated by middleware + role check)
exports.uploadBlob = async (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      console.error("Upload middleware error:", err.message);
      return res.status(400).json({
        success: false,
        message: "File upload error: " + err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    try {
      const { containerName, folderName } = req.params;
      const { filename, isProfileImage } = req.body;
      const originalFilename = filename || req.file.originalname;

      const hasAccess = await checkUserAccess(
        req.user.userId,
        containerName,
        folderName
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      const containerExists = await containerClient.exists();
      if (!containerExists) {
        return res.status(404).json({
          success: false,
          message: "Container not found",
        });
      }

      // Check if this should be processed as a profile image
      if (
        isProfileImage === "true" &&
        isImageFile(originalFilename, req.file.mimetype)
      ) {
        try {
          // Process as profile image
          const profileResult = await processProfileImage(
            req.file.buffer,
            originalFilename
          );

          // Upload processed profile image
          const profileBlobName = `${folderName}/${profileResult.filename}`;
          const profileBlobClient =
            containerClient.getBlobClient(profileBlobName);
          const profileBlockBlobClient = profileBlobClient.getBlockBlobClient();

          await profileBlockBlobClient.upload(
            profileResult.buffer,
            profileResult.buffer.length,
            {
              blobHTTPHeaders: {
                blobContentType: profileResult.contentType,
              },
              metadata: {
                originalFileName: originalFilename,
                processedAt: new Date().toISOString(),
                isProfileImage: "true",
                dimensions: `${PROFILE_IMAGE_CONFIG.width}x${PROFILE_IMAGE_CONFIG.height}`,
                uploadedBy: req.user.name,
              },
            }
          );

          // Log the upload
          await logFileOperation(
            req.user.userId,
            containerName,
            folderName,
            profileResult.filename,
            "UPLOAD_PROFILE_IMAGE"
          );

          return res.status(201).json({
            success: true,
            containerName,
            folderName,
            blobName: profileResult.filename,
            originalFilename: originalFilename,
            fullPath: profileBlobName,
            contentType: profileResult.contentType,
            size: profileResult.buffer.length,
            uploadedBy: {
              id: req.user.userId,
              role: req.user.role,
              name: req.user.name,
            },
            profileImageProcessing: {
              processed: true,
              standardName: profileResult.filename,
              dimensions: `${PROFILE_IMAGE_CONFIG.width}x${PROFILE_IMAGE_CONFIG.height}`,
              format: PROFILE_IMAGE_CONFIG.format,
              message: `Image processed and saved as patient profile image`,
            },
          });
        } catch (profileError) {
          console.error("Profile image processing failed:", profileError);
          return res.status(400).json({
            success: false,
            message: `Profile image processing failed: ${profileError.message}`,
          });
        }
      }

      // Check if this is an RTF file
      if (rtfConversionService.isRTFFile(originalFilename, req.file.buffer)) {
        try {
          // Convert RTF to TXT and upload only TXT
          const conversionResult =
            await rtfConversionService.processRTFFileToTxtOnly(
              containerName,
              folderName,
              originalFilename,
              req.file.buffer
            );

          // Log the upload (TXT file only)
          await logFileOperation(
            req.user.userId,
            containerName,
            folderName,
            conversionResult.txtFileName,
            "UPLOAD_RTF_AS_TXT"
          );

          const response = {
            success: true,
            containerName,
            folderName,
            blobName: conversionResult.txtFileName,
            originalFilename: originalFilename,
            convertedFilename: conversionResult.txtFileName,
            fullPath: conversionResult.txtBlobName,
            contentType: "text/plain",
            size: conversionResult.convertedSize,
            uploadedBy: {
              id: req.user.userId,
              role: req.user.role,
              name: req.user.name,
            },
            rtfConversion: {
              converted: true,
              originalRtfFile: originalFilename,
              txtFileName: conversionResult.txtFileName,
              originalSize: conversionResult.originalSize,
              convertedSize: conversionResult.convertedSize,
              message: `RTF file converted and saved as ${conversionResult.txtFileName}. Original RTF file was not stored.`,
            },
          };

          return res.status(201).json(response);
        } catch (conversionError) {
          console.error("RTF conversion failed:", conversionError);
          return res.status(400).json({
            success: false,
            message: `RTF conversion failed: ${conversionError.message}`,
          });
        }
      } else {
        // Upload non-RTF files normally
        const blobName = originalFilename;
        const fullBlobName = `${folderName}/${blobName}`;
        const blobClient = containerClient.getBlobClient(fullBlobName);
        const blockBlobClient = blobClient.getBlockBlobClient();

        const uploadOptions = {
          blobHTTPHeaders: {
            blobContentType: req.file.mimetype,
          },
        };

        // Upload the file
        await blockBlobClient.upload(
          req.file.buffer,
          req.file.size,
          uploadOptions
        );

        // Log the upload
        await logFileOperation(
          req.user.userId,
          containerName,
          folderName,
          blobName,
          "UPLOAD"
        );

        const response = {
          success: true,
          containerName,
          folderName,
          blobName,
          originalFilename,
          fullPath: fullBlobName,
          contentType: req.file.mimetype,
          size: req.file.size,
          uploadedBy: {
            id: req.user.userId,
            role: req.user.role,
            name: req.user.name,
          },
        };

        return res.status(201).json(response);
      }
    } catch (err) {
      console.error("Upload error:", err.message);
      res.status(500).json({
        success: false,
        message: "Server error: " + err.message,
      });
    }
  });
};

// @route   DELETE api/blobs/:containerName/:folderName/:blobName
// @desc    Delete a blob
// @access  Private/Admin (authenticated by middleware + role check)
exports.deleteBlob = async (req, res) => {
  try {
    const { containerName, folderName, blobName } = req.params;

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const containerExists = await containerClient.exists();

    if (!containerExists) {
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    const fullBlobName = `${folderName}/${blobName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);
    const blobExists = await blobClient.exists();

    if (!blobExists) {
      return res.status(404).json({
        success: false,
        message: "Blob not found",
      });
    }

    // Delete the file
    await blobClient.delete();

    const operation =
      blobName === PROFILE_IMAGE_CONFIG.standardName
        ? "DELETE_PROFILE_IMAGE"
        : "DELETE";
    await logFileOperation(
      req.user.userId,
      containerName,
      folderName,
      blobName,
      operation
    );

    res.json({
      success: true,
      message: `File deleted successfully`,
      containerName,
      folderName,
      deletedFiles: [blobName],
      wasProfileImage: blobName === PROFILE_IMAGE_CONFIG.standardName,
    });
  } catch (err) {
    console.error("Delete blob error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/blobs/audit
// @desc    Get audit logs for file operations
// @access  Private/Admin (authenticated by middleware + role check)
exports.getAuditLogs = async (req, res) => {
  try {
    const {
      userId,
      containerName,
      folderName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = req.query;

    await pool.connect();

    let query =
      "SELECT fa.*, u.name, u.username, u.role FROM FileAudit fa LEFT JOIN Users u ON fa.userId = u.userId WHERE 1=1";
    const queryParams = [];

    if (userId) {
      query += " AND fa.userId = @userId";
      queryParams.push({ name: "userId", value: parseInt(userId) });
    }

    if (containerName) {
      query += " AND fa.containerName = @containerName";
      queryParams.push({ name: "containerName", value: containerName });
    }

    if (folderName) {
      query += " AND fa.folderName = @folderName";
      queryParams.push({ name: "folderName", value: folderName });
    }

    if (operation) {
      query += " AND fa.operation = @operation";
      queryParams.push({ name: "operation", value: operation });
    }

    if (startDate) {
      query += " AND fa.timestamp >= @startDate";
      queryParams.push({ name: "startDate", value: new Date(startDate) });
    }

    if (endDate) {
      query += " AND fa.timestamp <= @endDate";
      queryParams.push({ name: "endDate", value: new Date(endDate) });
    }

    query +=
      " ORDER BY fa.timestamp DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    queryParams.push({ name: "offset", value: parseInt(offset) });
    queryParams.push({ name: "limit", value: parseInt(limit) });

    const request = pool.request();
    queryParams.forEach((param) => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      auditLogs: result.recordset,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.recordset.length,
      },
    });
  } catch (err) {
    console.error("Get audit logs error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Helper function to convert stream to buffer
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
}
