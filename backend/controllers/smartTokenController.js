// controllers/smartTokenController.js - Complete Updated Version with View-Only Access
const { pool, sql } = require("../config/database");
const { blobServiceClient } = require("../config/azure-storage");
const {
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// Helper function to generate SAS token for emergency access with 5-minute expiry
const generateEmergencySasToken = (containerName, blobName) => {
  try {
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

    if (!accountName || !accountKey) {
      throw new Error("Missing Azure Storage credentials");
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );

    const permissions = BlobSASPermissions.parse("r");

    const sasOptions = {
      containerName,
      blobName,
      permissions: permissions,
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 5 * 60 * 1000), // 5 minutes
    };

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();

    return sasToken;
  } catch (err) {
    console.error("SAS token generation error:", err.message);
    throw err;
  }
};

// Helper function to check if token is revoked/disabled
const checkTokenStatus = async (smartTokenId) => {
  try {
    await pool.connect();
    const result = await pool
      .request()
      .input("smartTokenId", smartTokenId)
      .query(
        "SELECT status, revokedAt, revokedBy, revokeReason FROM SmartTokens WHERE smartTokenId = @smartTokenId"
      );

    if (result.recordset.length === 0) {
      return { exists: false };
    }

    const token = result.recordset[0];
    return {
      exists: true,
      status: token.status,
      isRevoked: token.status === "revoked",
      revokedAt: token.revokedAt,
      revokedBy: token.revokedBy,
      revokeReason: token.revokeReason,
    };
  } catch (error) {
    console.error("Error checking token status:", error);
    return { exists: false, error: true };
  }
};

// Helper function to get patient files from Azure
const getPatientFilesFromAzure = async (containerName, folderName) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobs = [];
    const folderPrefix = `${folderName}/`;
    const blobIterator = containerClient.listBlobsFlat({
      prefix: folderPrefix,
    });

    for await (const blob of blobIterator) {
      if (blob.name === folderPrefix) continue;

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

    return blobs;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching patient files:", error);
    }
    return [];
  }
};

// Helper function for file size formatting
const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Main verification endpoint - UPDATED with remote disconnect check
exports.verifySmartToken = async (req, res) => {
  try {
    const { id } = req.params;
    const { s: signature } = req.query;

    // Validate input
    if (!id || !signature) {
      return res.status(400).render("error", {
        title: "Invalid Token",
        message: "Invalid token format. Please scan a valid SmartToken.",
        errorCode: "INVALID_FORMAT",
        instructions:
          "Please ensure you are scanning a valid SmartToken device.",
      });
    }

    // Check if token is revoked/disabled FIRST
    const tokenStatus = await checkTokenStatus(id);
    if (tokenStatus.isRevoked) {
      return res.status(403).render("tokenRevoked", {
        title: "Token Revoked",
        message:
          "This SmartToken has been remotely disconnected and is no longer valid.",
        tokenId: id,
        revokedAt: tokenStatus.revokedAt,
        revokeReason:
          tokenStatus.revokeReason || "Token reported lost or compromised",
        instructions:
          "Please contact the medical facility for a replacement token.",
      });
    }

    // Validate signature format
    if (!signature.match(/^[A-F0-9-]+$/i)) {
      return res.status(400).render("error", {
        title: "Invalid Signature",
        message: "Invalid token signature format.",
        errorCode: "INVALID_SIGNATURE",
        instructions: "Please scan the SmartToken again or contact support.",
      });
    }

    let vivoKeyResponse;

    try {
      // Call VivoKey Verify API
      vivoKeyResponse = await axios.post(
        "https://auth.vivokey.com/validate",
        {
          signature: signature,
        },
        {
          headers: {
            "X-API-VIVOKEY": process.env.VIVOKEY_API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
    } catch (apiError) {
      // Handle network/API errors - fallback to offline mode
      return await handleOfflineMode(req, res, id);
    }

    // Handle VivoKey API responses
    if (vivoKeyResponse.data.result === "success") {
      const jwtToken = vivoKeyResponse.data.token;

      // Decode JWT to get secure chip ID
      const decoded = jwt.decode(jwtToken);
      if (!decoded || !decoded.sub) {
        return res.status(400).render("error", {
          title: "Token Error",
          message: "Invalid token response from verification service.",
          errorCode: "INVALID_JWT",
          instructions: "Please try scanning the token again.",
        });
      }

      const secureChipId = decoded.sub;

      // Check database for token
      await pool.connect();
      let tokenRecord = await pool
        .request()
        .input("smartTokenId", id)
        .input("secureChipId", secureChipId)
        .query(
          "SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId AND secureChipId = @secureChipId"
        );

      // Auto-enrollment for new tokens
      if (tokenRecord.recordset.length === 0) {
        await pool
          .request()
          .input("smartTokenId", id)
          .input("secureChipId", secureChipId)
          .input("productCode", decoded.product || 7)
          .input("devId", decoded.dev_id).query(`
            INSERT INTO SmartTokens (smartTokenId, secureChipId, productCode, devId, status, createdAt)
            VALUES (@smartTokenId, @secureChipId, @productCode, @devId, 'unclaimed', GETDATE())
          `);

        return res.render("tokenStatus", {
          title: "Token Registered",
          message:
            "SmartToken has been registered in the system but is not yet assigned to a patient.",
          status: "unclaimed",
          tokenId: id,
          instructions:
            "Please contact the medical facility to assign this token to a patient record.",
        });
      }

      const token = tokenRecord.recordset[0];

      // Double-check token status from database
      if (token.status === "revoked") {
        return res.status(403).render("tokenRevoked", {
          title: "Token Revoked",
          message: "This SmartToken has been remotely disconnected.",
          tokenId: id,
          revokedAt: token.revokedAt,
          revokeReason:
            token.revokeReason || "Token reported lost or compromised",
          instructions: "Please contact the medical facility for assistance.",
        });
      }

      // Check if token is assigned to patient
      if (
        token.containerName &&
        token.folderName &&
        token.status === "assigned"
      ) {
        // Get patient files from Azure
        const patientFiles = await getPatientFilesFromAzure(
          token.containerName,
          token.folderName
        );

        // Note: Files will use view-only access through the frontend
        const filesForDisplay = patientFiles.map((file) => ({
          ...file,
          // No SAS URL needed - will use view-only endpoint
        }));

        // Log access for audit
        await logTokenAccess(id, token.containerName, token.folderName, req.ip);

        // Render patient data page with view-only access
        return res.render("patientData", {
          title: `Patient Data - ${token.patientName || token.folderName}`,
          patientName: token.patientName || token.folderName,
          containerName: token.containerName,
          folderName: token.folderName,
          files: filesForDisplay,
          isEmergencyAccess: true,
          accessTime: new Date().toISOString(),
          tokenId: id,
          formatFileSize: formatFileSize,
        });
      } else {
        return res.render("tokenStatus", {
          title: "Token Not Assigned",
          message:
            "This SmartToken is registered but not assigned to any patient.",
          status: "unassigned",
          tokenId: id,
          instructions:
            "Please contact the medical facility to assign this token to a patient record.",
        });
      }
    } else if (vivoKeyResponse.data.result === "expired") {
      return res.render("tokenExpired", {
        title: "Token Expired",
        message: "This SmartToken link has expired.",
        instructions:
          "Please scan the SmartToken again to generate a new link.",
        tokenId: id,
      });
    } else if (vivoKeyResponse.data.result === "invalid") {
      return res.status(400).render("error", {
        title: "Invalid Token",
        message: "This SmartToken signature is invalid.",
        errorCode: "INVALID_TOKEN",
        instructions:
          "Please ensure you are scanning a valid SmartToken device.",
      });
    } else {
      return res.status(400).render("error", {
        title: "Unknown Response",
        message: "Received unknown response from verification service.",
        errorCode: "UNKNOWN_RESPONSE",
        instructions: "Please try again or contact technical support.",
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("SmartToken verification error:", error);
    }
    return res.status(500).render("error", {
      title: "System Error",
      message: "An error occurred while verifying the SmartToken.",
      errorCode: "SYSTEM_ERROR",
      instructions: "Please try again or contact technical support.",
    });
  }
};

// Handle offline mode when VivoKey API is unavailable
const handleOfflineMode = async (req, res, tokenId) => {
  try {
    // Check token status even in offline mode
    const tokenStatus = await checkTokenStatus(tokenId);
    if (tokenStatus.isRevoked) {
      return res.status(403).render("tokenRevoked", {
        title: "Token Revoked",
        message: "This SmartToken has been remotely disconnected.",
        tokenId: tokenId,
        revokedAt: tokenStatus.revokedAt,
        revokeReason:
          tokenStatus.revokeReason || "Token reported lost or compromised",
        instructions: "Please contact the medical facility for assistance.",
        isOfflineMode: true,
      });
    }

    await pool.connect();
    const tokenRecord = await pool
      .request()
      .input("smartTokenId", tokenId)
      .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

    if (tokenRecord.recordset.length > 0) {
      const token = tokenRecord.recordset[0];

      if (
        token.containerName &&
        token.folderName &&
        token.status === "assigned"
      ) {
        // Get limited patient data in offline mode
        const patientFiles = await getPatientFilesFromAzure(
          token.containerName,
          token.folderName
        );

        // Files will use view-only access
        const filesForDisplay = patientFiles.map((file) => ({
          ...file,
          // No SAS URL needed - will use view-only endpoint
        }));

        // Log offline access
        await logTokenAccess(
          tokenId,
          token.containerName,
          token.folderName,
          req.ip,
          "offline"
        );

        return res.render("patientData", {
          title: `Patient Data - ${
            token.patientName || token.folderName
          } (Limited Access)`,
          patientName: token.patientName || token.folderName,
          containerName: token.containerName,
          folderName: token.folderName,
          files: filesForDisplay,
          isEmergencyAccess: true,
          isOfflineMode: true,
          warning: "Limited access - Token verification service unavailable",
          accessTime: new Date().toISOString(),
          tokenId: tokenId,
          formatFileSize: formatFileSize,
        });
      } else {
        return res.render("tokenStatus", {
          title: "Token Not Assigned",
          message: "Token found but not assigned to any patient.",
          status: "unassigned",
          isOfflineMode: true,
          tokenId: tokenId,
          instructions:
            "Please contact the medical facility when connection is restored.",
        });
      }
    } else {
      return res.render("error", {
        title: "Token Not Found",
        message:
          "SmartToken not recognized and verification service is unavailable.",
        errorCode: "OFFLINE_UNKNOWN_TOKEN",
        instructions:
          "Network connection is required for new tokens. Please try again when connection is restored.",
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Offline mode error:", error);
    }
    return res.status(500).render("error", {
      title: "Database Error",
      message: "Unable to access token database.",
      errorCode: "DATABASE_ERROR",
      instructions: "Please contact technical support.",
    });
  }
};

// Get file with SAS URL - LEGACY (kept for backward compatibility)
exports.getPatientFile = async (req, res) => {
  try {
    const { containerName, folderName, fileName } = req.params;

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const fullBlobName = `${folderName}/${fileName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);

    // Check if blob exists
    const blobExists = await blobClient.exists();
    if (!blobExists) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Generate SAS token for emergency read access with 5-minute expiry
    const sasToken = generateEmergencySasToken(containerName, fullBlobName);
    const sasUrl = `${blobClient.url}?${sasToken}`;

    // Redirect to file
    res.redirect(sasUrl);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("File access error:", error);
    }
    res.status(500).json({
      success: false,
      message: "Error accessing file",
    });
  }
};

// NEW: Get file with view-only access (no download) for SmartToken emergency access
exports.getPatientFileViewOnly = async (req, res) => {
  try {
    const { containerName, folderName, fileName } = req.params;

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const fullBlobName = `${folderName}/${fileName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);

    // Check if blob exists
    const blobExists = await blobClient.exists();
    if (!blobExists) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Get blob properties to determine content type
    const properties = await blobClient.getProperties();
    const contentType = properties.contentType || "application/octet-stream";

    // Download blob content
    const downloadResponse = await blobClient.download();

    // Set headers for viewing only (prevent download)
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline"); // Force inline viewing
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // For PDF files, explicitly prevent download
    if (contentType.includes("pdf")) {
      res.setHeader(
        "Content-Disposition",
        'inline; filename="medical_document.pdf"'
      );
    }

    // For images, ensure they display inline
    if (contentType.includes("image")) {
      res.setHeader("Content-Disposition", "inline");
    }

    // Stream the file content directly to response
    downloadResponse.readableStreamBody.pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("File view error:", error);
    }
    res.status(500).json({
      success: false,
      message: "Error accessing file",
    });
  }
};

// NEW: Get file with authenticated view-only access (for regular users)
exports.getPatientFileViewOnlyAuth = async (req, res) => {
  try {
    const { containerName, folderName, fileName } = req.params;

    // Get token from header or query parameter
    let token = req.header("x-auth-token") || req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No authentication token provided",
      });
    }

    // Verify token
    let user;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.user) {
        return res.status(401).json({
          success: false,
          message: "Invalid token format",
        });
      }

      // Get user from database
      await pool.connect();
      const result = await pool
        .request()
        .input("userId", decoded.user.id || decoded.user.userId)
        .query("SELECT * FROM Users WHERE userId = @userId");

      if (result.recordset.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      user = result.recordset[0];
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Check if user has access (admin has access to everything)
    if (user.role !== "admin") {
      // Check container assignment
      const containerResult = await pool
        .request()
        .input("userId", user.userId)
        .input("containerName", containerName)
        .query(
          "SELECT * FROM ContainerAssignments WHERE userId = @userId AND containerName = @containerName"
        );

      if (containerResult.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Check folder assignment
      const folderResult = await pool
        .request()
        .input("userId", user.userId)
        .input("containerName", containerName)
        .input("folderName", folderName)
        .query(
          "SELECT * FROM FolderAssignments WHERE userId = @userId AND containerName = @containerName AND folderName = @folderName"
        );

      if (folderResult.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const fullBlobName = `${folderName}/${fileName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);

    // Check if blob exists
    const blobExists = await blobClient.exists();
    if (!blobExists) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Get blob properties to determine content type
    const properties = await blobClient.getProperties();
    const contentType = properties.contentType || "application/octet-stream";

    // Download blob content
    const downloadResponse = await blobClient.download();

    // Set headers for viewing only (prevent download)
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline"); // Force inline viewing
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // For PDF files, explicitly prevent download
    if (contentType.includes("pdf")) {
      res.setHeader(
        "Content-Disposition",
        'inline; filename="medical_document.pdf"'
      );
    }

    // For images, ensure they display inline
    if (contentType.includes("image")) {
      res.setHeader("Content-Disposition", "inline");
    }

    // Log the view for audit
    try {
      await pool
        .request()
        .input("userId", user.userId)
        .input("containerName", containerName)
        .input("folderName", folderName)
        .input("blobName", fileName)
        .input("operation", "VIEW").query(`
          INSERT INTO FileAudit (userId, containerName, folderName, blobName, operation)
          VALUES (@userId, @containerName, @folderName, @blobName, @operation)
        `);
    } catch (auditErr) {
      console.error("Audit logging error:", auditErr.message);
      // Don't fail the request for audit logging errors
    }

    // Stream the file content directly to response
    downloadResponse.readableStreamBody.pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("File view error:", error);
    }
    res.status(500).json({
      success: false,
      message: "Error accessing file",
    });
  }
};

// Log token access for audit
const logTokenAccess = async (
  tokenId,
  containerName,
  folderName,
  ipAddress,
  mode = "online"
) => {
  try {
    await pool.connect();
    await pool
      .request()
      .input("tokenId", tokenId)
      .input("containerName", containerName)
      .input("folderName", folderName)
      .input("ipAddress", ipAddress)
      .input("accessMode", mode).query(`
        INSERT INTO TokenAccessLog (tokenId, containerName, folderName, ipAddress, accessMode, accessTime)
        VALUES (@tokenId, @containerName, @folderName, @ipAddress, @accessMode, GETDATE())
      `);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error logging token access:", error);
    }
  }
};

// NEW: Get all assigned tokens (for remote disconnect management)
exports.getAllAssignedTokens = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().query(`
      SELECT 
        smartTokenId, 
        secureChipId, 
        productCode, 
        patientName,
        containerName,
        folderName,
        status,
        createdAt,
        assignedAt,
        revokedAt,
        revokedBy,
        revokeReason
      FROM SmartTokens 
      WHERE status IN ('assigned', 'revoked')
      ORDER BY 
        CASE WHEN status = 'assigned' THEN 0 ELSE 1 END,
        assignedAt DESC
    `);

    res.json({
      success: true,
      tokens: result.recordset,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error in getAllAssignedTokens:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned tokens",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

// NEW: Remote disconnect/revoke token
exports.revokeSmartToken = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const { tokenId, reason } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required",
      });
    }

    await pool.connect();

    // Check if token exists and is not already revoked
    const tokenCheck = await pool
      .request()
      .input("smartTokenId", tokenId)
      .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

    if (tokenCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    const token = tokenCheck.recordset[0];

    if (token.status === "revoked") {
      return res.status(400).json({
        success: false,
        message: "Token is already revoked",
      });
    }

    // Revoke the token
    await pool
      .request()
      .input("smartTokenId", tokenId)
      .input("revokedBy", req.user.userId)
      .input("revokeReason", reason || "Remotely disconnected by administrator")
      .query(`
        UPDATE SmartTokens 
        SET status = 'revoked',
            revokedAt = GETDATE(),
            revokedBy = @revokedBy,
            revokeReason = @revokeReason
        WHERE smartTokenId = @smartTokenId
      `);

    // Log the revocation for audit
    await pool
      .request()
      .input("tokenId", tokenId)
      .input("userId", req.user.userId)
      .input("action", "REVOKE")
      .input("reason", reason || "Remotely disconnected").query(`
        INSERT INTO TokenAudit (tokenId, userId, action, reason, timestamp)
        VALUES (@tokenId, @userId, @action, @reason, GETDATE())
      `);

    res.json({
      success: true,
      message: `SmartToken ${tokenId} has been remotely disconnected`,
      tokenId: tokenId,
      revokedBy: req.user.name,
      revokedAt: new Date().toISOString(),
      reason: reason || "Remotely disconnected by administrator",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error revoking token:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to revoke token",
    });
  }
};

// NEW: Reactivate revoked token
exports.reactivateSmartToken = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const { tokenId } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required",
      });
    }

    await pool.connect();

    // Check if token exists and is revoked
    const tokenCheck = await pool
      .request()
      .input("smartTokenId", tokenId)
      .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

    if (tokenCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    const token = tokenCheck.recordset[0];

    if (token.status !== "revoked") {
      return res.status(400).json({
        success: false,
        message: "Token is not currently revoked",
      });
    }

    // Reactivate the token
    await pool.request().input("smartTokenId", tokenId).query(`
        UPDATE SmartTokens 
        SET status = 'assigned',
            revokedAt = NULL,
            revokedBy = NULL,
            revokeReason = NULL
        WHERE smartTokenId = @smartTokenId
      `);

    // Log the reactivation for audit
    await pool
      .request()
      .input("tokenId", tokenId)
      .input("userId", req.user.userId)
      .input("action", "REACTIVATE")
      .input("reason", "Token reactivated by administrator").query(`
        INSERT INTO TokenAudit (tokenId, userId, action, reason, timestamp)
        VALUES (@tokenId, @userId, @action, @reason, GETDATE())
      `);

    res.json({
      success: true,
      message: `SmartToken ${tokenId} has been reactivated`,
      tokenId: tokenId,
      reactivatedBy: req.user.name,
      reactivatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error reactivating token:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to reactivate token",
    });
  }
};

// Admin functions for token management
exports.getUnclaimedTokens = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().query(`
      SELECT smartTokenId, secureChipId, productCode, devId, createdAt, status
      FROM SmartTokens 
      WHERE status = 'unclaimed' 
      ORDER BY createdAt DESC
    `);

    res.json({
      success: true,
      tokens: result.recordset,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error in getUnclaimedTokens:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to fetch unclaimed tokens",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

exports.assignTokenToPatient = async (req, res) => {
  try {
    const { tokenId, containerName, folderName, patientName } = req.body;

    if (!tokenId || !containerName || !folderName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    await pool.connect();
    await pool
      .request()
      .input("smartTokenId", tokenId)
      .input("containerName", containerName)
      .input("folderName", folderName)
      .input("patientName", patientName).query(`
        UPDATE SmartTokens 
        SET containerName = @containerName, 
            folderName = @folderName,
            patientName = @patientName,
            status = 'assigned', 
            assignedAt = GETDATE()
        WHERE smartTokenId = @smartTokenId
      `);

    res.json({
      success: true,
      message: "Token assigned to patient successfully",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error assigning token:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to assign token",
    });
  }
};
