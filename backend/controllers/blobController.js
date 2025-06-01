// controllers/blobController.js - SAFARI iOS COMPATIBLE VERSION
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
const { blobServiceClient } = require("../config/azure-storage");
const { pool, sql } = require("../config/database");
const multer = require("multer");

// Configure multer
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Simplified file operation logging
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

// Check user access to container/folder
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

    // Admin has access to everything
    if (userRole === "admin") {
      return true;
    }

    // Check container assignment
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

    // Check folder assignment if specified
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
// @desc    Get all blobs in a folder
// @access  Private
exports.getBlobs = async (req, res) => {
  try {
    const { containerName, folderName } = req.params;

    // User is already authenticated by middleware
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
    const folderPrefix = `${folderName}/`;
    const blobIterator = containerClient.listBlobsFlat({
      prefix: folderPrefix,
    });

    for await (const blob of blobIterator) {
      if (blob.name === folderPrefix) {
        continue;
      }

      const blobName = blob.name.replace(folderPrefix, "");
      blobs.push({
        name: blobName,
        fullPath: blob.name,
        contentType: blob.properties.contentType,
        contentLength: blob.properties.contentLength,
        createdOn: blob.properties.createdOn,
        lastModified: blob.properties.lastModified,
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
    });
  } catch (err) {
    console.error("getBlobs error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/blobs/:containerName/:folderName/:blobName/view
// @desc    View file content directly in new tab - UNIVERSAL BROWSER COMPATIBLE
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

    // Set secure headers for viewing only - Universal browser compatible
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

    // Special handling for different file types with Safari iOS compatibility
    if (contentType.includes("pdf")) {
      res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    }

    if (contentType.includes("image")) {
      res.setHeader("Content-Disposition", "inline");
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
      "VIEW"
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
// @desc    Upload a blob with original filename
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
      const { filename } = req.body;
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

      const blobName = originalFilename;
      const fullBlobName = `${folderName}/${blobName}`;
      const blobClient = containerClient.getBlobClient(fullBlobName);
      const blockBlobClient = blobClient.getBlockBlobClient();

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: req.file.mimetype,
        },
      };

      await blockBlobClient.upload(
        req.file.buffer,
        req.file.size,
        uploadOptions
      );

      await logFileOperation(
        req.user.userId,
        containerName,
        folderName,
        blobName,
        "UPLOAD"
      );

      res.status(201).json({
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
      });
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

    await blobClient.delete();

    await logFileOperation(
      req.user.userId,
      containerName,
      folderName,
      blobName,
      "DELETE"
    );

    res.json({
      success: true,
      message: "Blob deleted successfully",
      containerName,
      folderName,
      blobName,
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
      "SELECT fa.*, u.name, u.username, u.role FROM FileAudit fa JOIN Users u ON fa.userId = u.userId WHERE 1=1";
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
