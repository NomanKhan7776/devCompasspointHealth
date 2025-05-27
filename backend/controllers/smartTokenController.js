// controllers/smartTokenController.js - Production version with 5-minute expiry
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
      expiresOn: new Date(new Date().valueOf() + 5 * 60 * 1000), // 5 minutes instead of 1 hour
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
    // Log errors server-side only
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

// Main verification endpoint
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

        // Generate SAS URLs for all files with 5-minute expiry
        const filesWithUrls = await Promise.all(
          patientFiles.map(async (file) => {
            try {
              const fullBlobName = `${token.folderName}/${file.name}`;
              const sasToken = generateEmergencySasToken(
                token.containerName,
                fullBlobName
              );
              const containerClient = blobServiceClient.getContainerClient(
                token.containerName
              );
              const blobClient = containerClient.getBlobClient(fullBlobName);
              const sasUrl = `${blobClient.url}?${sasToken}`;

              return {
                ...file,
                sasUrl: sasUrl,
              };
            } catch (err) {
              console.error(`Error generating SAS URL for ${file.name}:`, err);
              return {
                ...file,
                sasUrl: null,
              };
            }
          })
        );

        // Log access for audit
        await logTokenAccess(id, token.containerName, token.folderName, req.ip);

        // Render patient data page with SAS URLs and session timer
        return res.render("patientData", {
          title: `Patient Data - ${token.patientName || token.folderName}`,
          patientName: token.patientName || token.folderName,
          containerName: token.containerName,
          folderName: token.folderName,
          files: filesWithUrls,
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
    // Log errors server-side only
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

        // Generate SAS URLs for all files even in offline mode with 5-minute expiry
        const filesWithUrls = await Promise.all(
          patientFiles.map(async (file) => {
            try {
              const fullBlobName = `${token.folderName}/${file.name}`;
              const sasToken = generateEmergencySasToken(
                token.containerName,
                fullBlobName
              );
              const containerClient = blobServiceClient.getContainerClient(
                token.containerName
              );
              const blobClient = containerClient.getBlobClient(fullBlobName);
              const sasUrl = `${blobClient.url}?${sasToken}`;

              return {
                ...file,
                sasUrl: sasUrl,
              };
            } catch (err) {
              console.error(`Error generating SAS URL for ${file.name}:`, err);
              return {
                ...file,
                sasUrl: null,
              };
            }
          })
        );

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
          files: filesWithUrls,
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

// Get file with SAS URL - UPDATED to handle direct access with 5-minute expiry
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
