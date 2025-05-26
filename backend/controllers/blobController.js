// controllers/blobController.js - COMPLETE UPDATED VERSION
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
const { blobServiceClient } = require("../config/azure-storage");
const { pool, sql } = require("../config/database");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Configure multer to use memory storage instead of disk storage
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit file size to 10MB
  },
});

// Helper function to log file operations for audit trail
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
    // Don't throw error - this is a non-critical operation
  }
};

// FIXED: Helper function to check if user has access to container/folder
const checkUserAccess = async (userId, containerName, folderName) => {
  try {
    // Make sure we're connected to the database
    await pool.connect();

    console.log("Checking access for:", { userId, containerName, folderName });

    // Get user role - FIXED: handle case where user doesn't exist
    const userResult = await pool
      .request()
      .input("id", userId)
      .query("SELECT role FROM Users WHERE userId = @id");

    if (userResult.recordset.length === 0) {
      console.log("User not found:", userId);
      return false;
    }

    const userRole = userResult.recordset[0].role;
    console.log("User role:", userRole);

    // Admin has access to everything
    if (userRole === "admin") {
      console.log("Admin access granted");
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

    console.log(
      "Container assignments found:",
      containerResult.recordset.length
    );

    if (containerResult.recordset.length === 0) {
      console.log("No container access");
      return false;
    }

    // If folderName is provided, check folder assignment
    if (folderName) {
      const folderResult = await pool
        .request()
        .input("userId", userId)
        .input("containerName", containerName)
        .input("folderName", folderName)
        .query(
          "SELECT * FROM FolderAssignments WHERE userId = @userId AND containerName = @containerName AND folderName = @folderName"
        );

      console.log("Folder assignments found:", folderResult.recordset.length);

      if (folderResult.recordset.length === 0) {
        console.log("No folder access");
        return false;
      }
    }

    console.log("Access granted");
    return true;
  } catch (err) {
    console.error("Access check error:", err.message);
    return false;
  }
};

// FIXED: Helper function to generate SAS token based on user role
const generateSasToken = (containerName, blobName, userRole) => {
  try {
    console.log("Generating SAS token for:", {
      containerName,
      blobName,
      userRole,
    });

    // Try to get account name and key from individual environment variables first
    let accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    let accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

    // If account key is not set individually, extract from connection string
    if (!accountKey && process.env.AZURE_STORAGE_CONNECTION_STRING) {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      // Extract account name from connection string
      const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
      if (accountNameMatch) {
        accountName = accountNameMatch[1];
      }

      // Extract account key from connection string
      const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);
      if (accountKeyMatch) {
        accountKey = accountKeyMatch[1];
      }
    }

    console.log("SAS Token credentials check:", {
      hasAccountName: !!accountName,
      hasAccountKey: !!accountKey,
      accountNameLength: accountName ? accountName.length : 0,
      accountKeyLength: accountKey ? accountKey.length : 0,
      extractedFromConnectionString: !process.env.AZURE_STORAGE_ACCOUNT_KEY,
    });

    if (!accountName || !accountKey) {
      throw new Error(
        `Missing Azure Storage credentials. AccountName: ${!!accountName}, AccountKey: ${!!accountKey}`
      );
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );

    // Set permissions based on user role
    let permissions;
    switch (userRole) {
      case "admin":
        permissions = BlobSASPermissions.parse("racwd"); // Full permissions
        break;
      case "doctor":
      case "nurse":
        permissions = BlobSASPermissions.parse("rcw"); // Read, Create, Write
        break;
      case "assistant":
      default:
        permissions = BlobSASPermissions.parse("r"); // Read-only
        break;
    }

    const sasOptions = {
      containerName,
      blobName,
      permissions: permissions,
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
    };

    console.log("SAS options:", sasOptions);

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();

    console.log("SAS token generated successfully, length:", sasToken.length);
    return sasToken;
  } catch (err) {
    console.error("SAS token generation error:", err.message);
    console.error("Error stack:", err.stack);
    throw err;
  }
};

// @route   GET api/blobs/:containerName/:folderName
// @desc    Get all blobs in a folder
// @access  Private
exports.getBlobs = async (req, res) => {
  try {
    const { containerName, folderName } = req.params;

    console.log("=== getBlobs Request ===");
    console.log("User:", req.user);
    console.log("Params:", { containerName, folderName });

    await pool.connect();

    // Check if user has access
    const hasAccess = await checkUserAccess(
      req.user.userId,
      containerName,
      folderName
    );
    if (!hasAccess) {
      console.log("Access denied for getBlobs");
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Check if container exists
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      console.log("Container not found for getBlobs");
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    // List blobs in folder
    const blobs = [];
    const folderPrefix = `${folderName}/`;
    const blobIterator = containerClient.listBlobsFlat({
      prefix: folderPrefix,
    });

    for await (const blob of blobIterator) {
      // Skip the folder itself (if it exists as a blob)
      if (blob.name === folderPrefix) {
        continue;
      }

      // Get blob name (without folder prefix)
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

    console.log(
      `Found ${blobs.length} blobs in ${containerName}/${folderName}`
    );

    // Log the list operation for audit
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

// FIXED: @route   GET api/blobs/:containerName/:folderName/:blobName/url
// @desc    Get SAS URL for a blob
// @access  Private
exports.getBlobSasUrl = async (req, res) => {
  try {
    const { containerName, folderName, blobName } = req.params;

    console.log("=== getBlobSasUrl Request ===");
    console.log("User:", req.user);
    console.log("Params:", { containerName, folderName, blobName });

    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      console.log("User not authenticated");
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    console.log("User authenticated:", {
      id: req.user.userId,
      role: req.user.role,
    });

    // Connect to database
    await pool.connect();

    // Check if user has access
    console.log("Checking user access...");
    const hasAccess = await checkUserAccess(
      req.user.userId,
      containerName,
      folderName
    );

    if (!hasAccess) {
      console.log("Access denied for user");
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    console.log("Access granted, proceeding with blob operations...");

    // Check Azure Storage configuration
    if (
      !process.env.AZURE_STORAGE_ACCOUNT_NAME ||
      !process.env.AZURE_STORAGE_ACCOUNT_KEY
    ) {
      console.error("Missing Azure Storage configuration");
      return res.status(500).json({
        success: false,
        message: "Storage configuration error",
      });
    }

    // Get container client
    console.log("Getting container client...");
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Check if container exists
    console.log("Checking if container exists...");
    let containerExists;
    try {
      containerExists = await containerClient.exists();
      console.log("Container exists:", containerExists);
    } catch (containerError) {
      console.error("Container check error:", containerError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to check container existence",
        error: containerError.message,
      });
    }

    if (!containerExists) {
      console.log("Container not found");
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    // Get blob client
    const fullBlobName = `${folderName}/${blobName}`;
    console.log("Full blob name:", fullBlobName);
    const blobClient = containerClient.getBlobClient(fullBlobName);

    // Check if blob exists
    console.log("Checking if blob exists...");
    let blobExists;
    try {
      blobExists = await blobClient.exists();
      console.log("Blob exists:", blobExists);
    } catch (blobError) {
      console.error("Blob check error:", blobError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to check blob existence",
        error: blobError.message,
      });
    }

    if (!blobExists) {
      console.log("Blob not found");
      return res.status(404).json({
        success: false,
        message: "Blob not found",
      });
    }

    // Generate SAS token with permissions based on user role
    console.log("Generating SAS token...");
    let sasToken;
    try {
      sasToken = generateSasToken(containerName, fullBlobName, req.user.role);
    } catch (sasError) {
      console.error("SAS token generation failed:", sasError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to generate SAS token",
        error: sasError.message,
      });
    }

    const sasUrl = `${blobClient.url}?${sasToken}`;
    console.log("SAS URL generated successfully");

    // Log the download operation for audit
    await logFileOperation(
      req.user.userId,
      containerName,
      folderName,
      blobName,
      "DOWNLOAD"
    );

    console.log("=== getBlobSasUrl Success ===");
    res.json({
      success: true,
      sasUrl,
      canModify: req.user.role === "admin",
      canUpload: ["admin", "doctor", "nurse"].includes(req.user.role),
    });
  } catch (err) {
    console.error("=== getBlobSasUrl Error ===");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({
      success: false,
      message: "Server error",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
};

// @route   POST api/blobs/:containerName/:folderName
// @desc    Upload a blob
// @access  Private/Admin,Doctor,Nurse
exports.uploadBlob = async (req, res) => {
  // Use multer middleware to handle file upload
  upload.single("file")(req, res, async (err) => {
    if (err) {
      console.error("Upload middleware error:", err.message);
      return res.status(400).json({
        success: false,
        message: "File upload error: " + err.message,
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    try {
      const { containerName, folderName } = req.params;
      const { filename } = req.body;

      console.log("=== Upload Blob Request ===");
      console.log("User:", req.user);
      console.log("Params:", { containerName, folderName });
      console.log("File:", {
        name: req.file.originalname,
        size: req.file.size,
      });

      // Check if user has access to this folder
      const hasAccess = await checkUserAccess(
        req.user.userId,
        containerName,
        folderName
      );
      if (!hasAccess) {
        console.log("Upload access denied");
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Get container client
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      // Check if container exists
      const containerExists = await containerClient.exists();
      if (!containerExists) {
        console.log("Container not found for upload");
        return res.status(404).json({
          success: false,
          message: "Container not found",
        });
      }

      // Generate blob name
      const blobName = filename || `${uuidv4()}-${req.file.originalname}`;
      const fullBlobName = `${folderName}/${blobName}`;

      console.log("Uploading to:", fullBlobName);

      // Get blob client
      const blobClient = containerClient.getBlobClient(fullBlobName);
      const blockBlobClient = blobClient.getBlockBlobClient();

      // Upload file - using buffer from memory storage instead of file from disk
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: req.file.mimetype,
        },
      };

      // Upload directly from buffer instead of reading from disk
      await blockBlobClient.upload(
        req.file.buffer,
        req.file.size,
        uploadOptions
      );

      console.log("Upload successful");

      // Log the upload operation for audit
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
// @access  Private/Admin
exports.deleteBlob = async (req, res) => {
  try {
    const { containerName, folderName, blobName } = req.params;

    console.log("=== Delete Blob Request ===");
    console.log("User:", req.user);
    console.log("Params:", { containerName, folderName, blobName });

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Check if container exists
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      console.log("Container not found for delete");
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    // Get blob client
    const fullBlobName = `${folderName}/${blobName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);

    // Check if blob exists
    const blobExists = await blobClient.exists();
    if (!blobExists) {
      console.log("Blob not found for delete");
      return res.status(404).json({
        success: false,
        message: "Blob not found",
      });
    }

    // Delete the blob
    await blobClient.delete();
    console.log("Blob deleted successfully");

    // Log the delete operation for audit - FIXED: use userId not id
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
// @access  Private/Admin
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

    console.log("=== Get Audit Logs Request ===");
    console.log("Filters:", { userId, containerName, folderName, operation });

    await pool.connect();

    // Build the query
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

    // Execute the query
    const request = pool.request();

    // Add parameters to the request
    queryParams.forEach((param) => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);

    console.log(`Found ${result.recordset.length} audit log entries`);

    res.json({
      success: true,
      auditLogs: result.recordset,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.recordset.length, // This is not accurate for total count, but sufficient for simple pagination
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

// ADD: Test function to debug Azure configuration
exports.testAzureConfig = async (req, res) => {
  try {
    console.log("=== Azure Configuration Test ===");

    const config = {
      hasConnectionString: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
      hasAccountName: !!process.env.AZURE_STORAGE_ACCOUNT_NAME,
      hasAccountKey: !!process.env.AZURE_STORAGE_ACCOUNT_KEY,
      connectionStringStart: process.env.AZURE_STORAGE_CONNECTION_STRING
        ? process.env.AZURE_STORAGE_CONNECTION_STRING.substring(0, 50) + "..."
        : "NOT SET",
      accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME || "NOT SET",
      accountKeyStart: process.env.AZURE_STORAGE_ACCOUNT_KEY
        ? process.env.AZURE_STORAGE_ACCOUNT_KEY.substring(0, 10) + "..."
        : "NOT SET",
    };

    console.log("Config:", config);

    // Test listing containers
    const containers = [];
    const containerIterator = blobServiceClient.listContainers();

    let count = 0;
    for await (const container of containerIterator) {
      containers.push(container.name);
      count++;
      if (count >= 3) break; // Limit to 3 for testing
    }

    console.log("Found containers:", containers);

    res.json({
      success: true,
      message: "Azure Storage connection successful",
      config: config,
      containerCount: containers.length,
      containers: containers,
    });
  } catch (err) {
    console.error("Azure test error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};
