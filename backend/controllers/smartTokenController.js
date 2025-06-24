// controllers/smartTokenController.js - UPDATED VERSION with Real User IP Detection
const { pool, sql } = require("../config/database");
const { blobServiceClient } = require("../config/azure-storage");
const {
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");
const axios = require("axios");
const jwt = require("jsonwebtoken");

/**
 * Get the real user IP address from request headers
 * Handles proxies, load balancers, CDNs, and direct connections
 * @param {Object} req - Express request object
 * @returns {string} - Real user IP address
 */
const getRealUserIP = (req) => {
  // Check various headers that proxies/load balancers use to forward real IP
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIP = req.headers["x-real-ip"];
  const cfConnectingIP = req.headers["cf-connecting-ip"]; // Cloudflare
  const xClientIP = req.headers["x-client-ip"];
  const xForwardedForAlt = req.headers["x-forwarded"];
  const forwardedForAlt = req.headers["forwarded-for"];
  const forwarded = req.headers["forwarded"];

  // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2, ...)
  // The first IP is the original client
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    // Return the first non-private IP or the first IP if all are private
    for (const ip of ips) {
      if (isValidPublicIP(ip)) {
        return ip;
      }
    }
    return ips[0]; // Fallback to first IP even if private
  }

  // Check other headers in order of preference
  if (realIP && isValidIP(realIP)) return realIP;
  if (cfConnectingIP && isValidIP(cfConnectingIP)) return cfConnectingIP;
  if (xClientIP && isValidIP(xClientIP)) return xClientIP;
  if (xForwardedForAlt && isValidIP(xForwardedForAlt)) return xForwardedForAlt;
  if (forwardedForAlt && isValidIP(forwardedForAlt)) return forwardedForAlt;

  // Parse the forwarded header (more complex format)
  if (forwarded) {
    const forMatch = forwarded.match(/for=([^;,\s]+)/);
    if (forMatch && forMatch[1]) {
      const ip = forMatch[1].replace(/"/g, "").replace(/\[|\]/g, "");
      if (isValidIP(ip)) return ip;
    }
  }

  // Fallback to connection-level IPs
  return (
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.req?.connection?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

/**
 * Validate if a string is a valid IP address
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IP
 */
const isValidIP = (ip) => {
  if (!ip || typeof ip !== "string") return false;

  // Remove IPv6 brackets if present
  ip = ip.replace(/\[|\]/g, "");

  // IPv4 regex
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

/**
 * Check if IP is a public IP (not private/local)
 * @param {string} ip - IP address to check
 * @returns {boolean} - True if public IP
 */
const isValidPublicIP = (ip) => {
  if (!isValidIP(ip)) return false;

  // Private IP ranges to exclude
  const privateRanges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^127\./, // 127.0.0.0/8 (localhost)
    /^169\.254\./, // 169.254.0.0/16 (link-local)
    /^::1$/, // IPv6 localhost
    /^fc00:/, // IPv6 private
    /^fe80:/, // IPv6 link-local
  ];

  return !privateRanges.some((range) => range.test(ip));
};

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

// Helper function to format date of birth
const formatDateOfBirth = (dateString) => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    // Format as MM/DD/YYYY
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (error) {
    console.error("Error formatting date of birth:", error);
    return null;
  }
};

// Updated log token access with real IP detection
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

    // Optional: Log to console in development for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(
        `📍 SmartToken Access Logged: ${tokenId.substring(
          0,
          8
        )}... from IP ${ipAddress} (${mode} mode)`
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error logging token access:", error);
    }
  }
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

        // Files will use view-only access through the emergency endpoint
        const filesForDisplay = patientFiles.map((file) => ({
          ...file,
          // Add emergency access info
          emergencyAccess: true,
        }));

        // Log access for audit with real user IP
        await logTokenAccess(
          id,
          token.containerName,
          token.folderName,
          getRealUserIP(req),
          "online"
        );

        // Format patient date of birth
        const formattedDOB = formatDateOfBirth(token.patientDateOfBirth);

        // Render patient data page with view-only access - Universal browser compatible
        return res.render("patientData", {
          title: `Patient Data - ${token.patientName || token.folderName}`,
          patientName: token.patientName || token.folderName,
          patientDateOfBirth: formattedDOB, // Add formatted DOB
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
          emergencyAccess: true,
        }));

        // Log offline access with real user IP
        await logTokenAccess(
          tokenId,
          token.containerName,
          token.folderName,
          getRealUserIP(req),
          "offline"
        );

        // Format patient date of birth
        const formattedDOB = formatDateOfBirth(token.patientDateOfBirth);

        return res.render("patientData", {
          title: `Patient Data - ${
            token.patientName || token.folderName
          } (Limited Access)`,
          patientName: token.patientName || token.folderName,
          patientDateOfBirth: formattedDOB, // Add formatted DOB
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

// FIXED: Emergency file access endpoint that works with all browsers
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
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>File Not Found</title>
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
            <h1>File Not Found</h1>
            <p>The requested medical file could not be found.</p>
            <button onclick="window.history.back()">Go Back</button>
          </div>
        </body>
        </html>
      `);
    }

    // Get blob properties to determine content type
    const properties = await blobClient.getProperties();
    const contentType = properties.contentType || "application/octet-stream";

    // Download blob content
    const downloadResponse = await blobClient.download();

    // Set headers for viewing only (prevent download) - Universal browser compatible
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline"); // Force inline viewing
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

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
          <p>An error occurred while accessing the medical file.</p>
          <button onclick="window.history.back()">Go Back</button>
        </div>
      </body>
      </html>
    `);
  }
};

// Rest of the existing functions (keeping them exactly as they were)
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
        patientDateOfBirth,
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
    const {
      tokenId,
      containerName,
      folderName,
      patientName,
      patientDateOfBirth,
    } = req.body;

    if (!tokenId || !containerName || !folderName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    await pool.connect();

    // Start a transaction to ensure data consistency
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Check if the patient folder is already assigned to another token
      const existingAssignment = await transaction
        .request()
        .input("containerName", containerName)
        .input("folderName", folderName)
        .input("currentTokenId", tokenId).query(`
          SELECT smartTokenId, patientName, assignedAt, status
          FROM SmartTokens 
          WHERE containerName = @containerName 
            AND folderName = @folderName 
            AND smartTokenId != @currentTokenId
            AND status = 'assigned'
        `);

      let previousTokenInfo = null;

      // If patient folder is already assigned to another token, revoke the old assignment
      if (existingAssignment.recordset.length > 0) {
        const existingToken = existingAssignment.recordset[0];
        previousTokenInfo = {
          tokenId: existingToken.smartTokenId,
          patientName: existingToken.patientName,
          assignedAt: existingToken.assignedAt,
        };

        // Revoke the existing token assignment
        await transaction
          .request()
          .input("existingTokenId", existingToken.smartTokenId)
          .input("revokeReason", "Patient folder reassigned to new token")
          .input("revokedBy", req.user.name || "System").query(`
            UPDATE SmartTokens 
            SET status = 'revoked',
                revokedAt = GETDATE(),
                revokedBy = @revokedBy,
                revokeReason = @revokeReason
            WHERE smartTokenId = @existingTokenId
          `);
      }

      // Check if the current token exists and its status
      const currentTokenCheck = await transaction
        .request()
        .input("tokenId", tokenId).query(`
          SELECT containerName, folderName, patientName, status
          FROM SmartTokens 
          WHERE smartTokenId = @tokenId
        `);

      if (currentTokenCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Token not found",
        });
      }

      const currentToken = currentTokenCheck.recordset[0];

      // Check if token is already revoked
      if (currentToken.status === "revoked") {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message:
            "Cannot assign a revoked token. Please reactivate the token first.",
        });
      }

      // Assign the token to the new patient folder
      await transaction
        .request()
        .input("smartTokenId", tokenId)
        .input("containerName", containerName)
        .input("folderName", folderName)
        .input("patientName", patientName)
        .input("patientDateOfBirth", patientDateOfBirth || null).query(`
          UPDATE SmartTokens 
          SET containerName = @containerName, 
              folderName = @folderName,
              patientName = @patientName,
              patientDateOfBirth = @patientDateOfBirth,
              status = 'assigned', 
              assignedAt = GETDATE()
          WHERE smartTokenId = @smartTokenId
        `);

      // Commit the transaction
      await transaction.commit();

      // Prepare response message
      let message = "Token assigned to patient successfully";
      let additionalInfo = {};

      if (previousTokenInfo) {
        message = "Patient folder reassigned successfully";
        additionalInfo = {
          reassignment: true,
          previousToken: {
            tokenId:
              previousTokenInfo.tokenId.substring(0, 8) +
              "..." +
              previousTokenInfo.tokenId.substring(
                previousTokenInfo.tokenId.length - 8
              ),
            patientName: previousTokenInfo.patientName,
            assignedAt: previousTokenInfo.assignedAt,
          },
          message: `Previous token (${previousTokenInfo.tokenId.substring(
            0,
            8
          )}...) has been automatically revoked and this patient folder is now assigned to the new token.`,
        };
      }

      res.json({
        success: true,
        message: message,
        tokenId: tokenId,
        patientFolder: `${containerName}/${folderName}`,
        patientName: patientName,
        assignedAt: new Date().toISOString(),
        assignedBy: req.user.name,
        ...additionalInfo,
      });
    } catch (transactionError) {
      // Rollback transaction on error
      await transaction.rollback();
      throw transactionError;
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error assigning token:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to assign token",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

exports.getAssignedFolders = async (req, res) => {
  try {
    const { containerName } = req.params;

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

    const result = await pool.request().input("containerName", containerName)
      .query(`
        SELECT 
          folderName, 
          smartTokenId, 
          patientName, 
          assignedAt,
          status
        FROM SmartTokens 
        WHERE containerName = @containerName 
          AND status = 'assigned'
          AND folderName IS NOT NULL
      `);

    // Create a map of assigned folders
    const assignedFolders = {};
    result.recordset.forEach((record) => {
      assignedFolders[record.folderName] = {
        tokenId: record.smartTokenId,
        patientName: record.patientName,
        assignedAt: record.assignedAt,
        status: record.status,
      };
    });

    res.json({
      success: true,
      assignedFolders: assignedFolders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error in getAssignedFolders:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned folders",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

exports.deleteSmartToken = async (req, res) => {
  try {
    const { tokenId } = req.params;

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

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required",
      });
    }

    await pool.connect();

    // Start a transaction to ensure data consistency
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Check if token exists
      const tokenCheck = await transaction
        .request()
        .input("smartTokenId", tokenId)
        .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

      if (tokenCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Token not found",
        });
      }

      const token = tokenCheck.recordset[0];

      // Store token info for response
      const tokenInfo = {
        tokenId: token.smartTokenId,
        patientName: token.patientName,
        containerName: token.containerName,
        folderName: token.folderName,
        status: token.status,
        assignedAt: token.assignedAt,
      };

      // Delete the token completely from database
      await transaction
        .request()
        .input("smartTokenId", tokenId)
        .query("DELETE FROM SmartTokens WHERE smartTokenId = @smartTokenId");

      // Commit the transaction
      await transaction.commit();

      res.json({
        success: true,
        message: "SmartToken deleted permanently",
        deletedToken: {
          tokenId:
            tokenInfo.tokenId.substring(0, 8) +
            "..." +
            tokenInfo.tokenId.substring(tokenInfo.tokenId.length - 8),
          patientName: tokenInfo.patientName,
          patientFolder:
            tokenInfo.containerName && tokenInfo.folderName
              ? `${tokenInfo.containerName}/${tokenInfo.folderName}`
              : "Not assigned",
          status: tokenInfo.status,
        },
        deletedAt: new Date().toISOString(),
        deletedBy: req.user.name,
      });
    } catch (transactionError) {
      await transaction.rollback();
      throw transactionError;
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error deleting token:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to delete token",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

exports.getSmartTokenLogs = async (req, res) => {
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

    const {
      tokenId,
      containerName,
      folderName,
      ipAddress,
      accessMode,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = req.query;

    await pool.connect();

    // First, get the total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM TokenAccessLog tal 
      LEFT JOIN SmartTokens st ON tal.tokenId = st.smartTokenId 
      WHERE 1=1`;

    const countParams = [];

    if (tokenId) {
      countQuery += " AND tal.tokenId = @tokenId";
      countParams.push({ name: "tokenId", value: tokenId });
    }

    if (containerName) {
      countQuery += " AND tal.containerName = @containerName";
      countParams.push({ name: "containerName", value: containerName });
    }

    if (folderName) {
      countQuery += " AND tal.folderName = @folderName";
      countParams.push({ name: "folderName", value: folderName });
    }

    if (ipAddress) {
      countQuery += " AND tal.ipAddress = @ipAddress";
      countParams.push({ name: "ipAddress", value: ipAddress });
    }

    if (accessMode) {
      countQuery += " AND tal.accessMode = @accessMode";
      countParams.push({ name: "accessMode", value: accessMode });
    }

    if (startDate) {
      countQuery += " AND tal.accessTime >= @startDate";
      countParams.push({ name: "startDate", value: new Date(startDate) });
    }

    if (endDate) {
      countQuery += " AND tal.accessTime <= @endDate";
      countParams.push({ name: "endDate", value: new Date(endDate) });
    }

    // Get total count
    const countRequest = pool.request();
    countParams.forEach((param) => {
      countRequest.input(param.name, param.value);
    });
    const countResult = await countRequest.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // Query TokenAccessLog with SmartTokens data
    let query = `
      SELECT 
        tal.tokenId,
        tal.containerName,
        tal.folderName,
        tal.ipAddress,
        tal.accessMode,
        tal.accessTime,
        st.patientName,
        st.status as tokenStatus,
        st.assignedAt
      FROM TokenAccessLog tal 
      LEFT JOIN SmartTokens st ON tal.tokenId = st.smartTokenId 
      WHERE 1=1`;

    const queryParams = [];

    if (tokenId) {
      query += " AND tal.tokenId = @tokenId";
      queryParams.push({ name: "tokenId", value: tokenId });
    }

    if (containerName) {
      query += " AND tal.containerName = @containerName";
      queryParams.push({ name: "containerName", value: containerName });
    }

    if (folderName) {
      query += " AND tal.folderName = @folderName";
      queryParams.push({ name: "folderName", value: folderName });
    }

    if (ipAddress) {
      query += " AND tal.ipAddress = @ipAddress";
      queryParams.push({ name: "ipAddress", value: ipAddress });
    }

    if (accessMode) {
      query += " AND tal.accessMode = @accessMode";
      queryParams.push({ name: "accessMode", value: accessMode });
    }

    if (startDate) {
      query += " AND tal.accessTime >= @startDate";
      queryParams.push({ name: "startDate", value: new Date(startDate) });
    }

    if (endDate) {
      query += " AND tal.accessTime <= @endDate";
      queryParams.push({ name: "endDate", value: new Date(endDate) });
    }

    query +=
      " ORDER BY tal.accessTime DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    queryParams.push({ name: "offset", value: parseInt(offset) });
    queryParams.push({ name: "limit", value: parseInt(limit) });

    const request = pool.request();
    queryParams.forEach((param) => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      logs: result.recordset,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount,
        currentPage: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching SmartToken logs:", error);
    }
    res.status(500).json({
      success: false,
      message: "Failed to fetch SmartToken logs",
    });
  }
};
