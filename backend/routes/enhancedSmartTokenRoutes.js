// // routes/enhancedSmartTokenRoutes.js
// const express = require("express");
// const router = express.Router();
// const auth = require("../middleware/auth");
// const { pool, sql } = require("../config/database");

// // @route   GET api/smart-tokens/unclaimed
// // @desc    Get unclaimed tokens (compatible with old API)
// // @access  Private/Admin
// router.get("/unclaimed", auth, async (req, res) => {
//   try {
//     if (!req.user || req.user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Admin access required",
//       });
//     }

//     await pool.connect();

//     const result = await pool.request().query(`
//       SELECT smartTokenId, secureChipId, productCode, devId, createdAt, status
//       FROM SmartTokens 
//       WHERE status = 'unclaimed' 
//       ORDER BY createdAt DESC
//     `);

//     res.json({
//       success: true,
//       tokens: result.recordset,
//       timestamp: new Date().toISOString(),
//     });
//   } catch (error) {
//     console.error("Error in getUnclaimedTokens:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch unclaimed tokens",
//     });
//   }
// });

// // @route   GET api/smart-tokens/all-with-users
// // @desc    Get all tokens with user associations (enhanced version)
// // @access  Private/Admin
// router.get("/all-with-users", auth, async (req, res) => {
//   try {
//     if (!req.user || req.user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Admin access required",
//       });
//     }

//     await pool.connect();

//     const result = await pool.request().query(`
//       SELECT 
//         st.smartTokenId,
//         st.secureChipId,
//         st.productCode,
//         st.containerName,
//         st.folderName,
//         st.patientName,
//         st.patientDateOfBirth,
//         st.status,
//         st.assignedAt,
//         st.createdAt,
//         pu.name as patientUserName,
//         pu.username as patientUsername,
//         pu.userId as patientUserId,
//         du.name as doctorName,
//         du.username as doctorUsername,
//         du.userId as doctorUserId,
//         ISNULL(df.registeredDevices, 0) as registeredDevices
//       FROM SmartTokens st
//       LEFT JOIN Users pu ON st.patientUserId = pu.userId
//       LEFT JOIN Users du ON st.doctorUserId = du.userId
//       LEFT JOIN (
//         SELECT userId, COUNT(*) as registeredDevices
//         FROM DeviceFingerprints 
//         WHERE isActive = 1
//         GROUP BY userId
//       ) df ON st.patientUserId = df.userId
//       WHERE st.status = 'assigned'
//       ORDER BY st.createdAt DESC
//     `);

//     res.json({
//       success: true,
//       tokens: result.recordset,
//     });
//   } catch (error) {
//     console.error("Error getting all tokens with users:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch tokens with user associations",
//     });
//   }
// });

// // @route   GET api/smart-tokens/patients-for-assignment
// // @desc    Get all patients for token assignment dropdown
// // @access  Private/Admin
// router.get("/patients-for-assignment", auth, async (req, res) => {
//   try {
//     if (!req.user || req.user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Admin access required",
//       });
//     }

//     await pool.connect();

//     const result = await pool.request().query(`
//       SELECT 
//         u.userId,
//         u.name,
//         u.username,
//         u.role,
//         COUNT(st.smartTokenId) as assignedTokens
//       FROM Users u
//       LEFT JOIN SmartTokens st ON u.userId = st.patientUserId AND st.status = 'assigned'
//       WHERE u.role = 'patient'
//       GROUP BY u.userId, u.name, u.username, u.role
//       ORDER BY u.name
//     `);

//     res.json({
//       success: true,
//       patients: result.recordset,
//     });
//   } catch (error) {
//     console.error("Error getting patients:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch patients",
//     });
//   }
// });

// // @route   GET api/smart-tokens/doctors-for-patient/:patientUserId
// // @desc    Get doctors assigned to a specific patient
// // @access  Private/Admin
// router.get("/doctors-for-patient/:patientUserId", auth, async (req, res) => {
//   try {
//     const { patientUserId } = req.params;

//     if (!req.user || req.user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Admin access required",
//       });
//     }

//     await pool.connect();

//     // Get all doctors (since we don't have complex relationships yet)
//     const result = await pool.request().input("patientUserId", patientUserId)
//       .query(`
//         SELECT DISTINCT
//           u.userId,
//           u.name,
//           u.username,
//           u.role
//         FROM Users u
//         WHERE u.role = 'doctor'
//         ORDER BY u.name
//       `);

//     res.json({
//       success: true,
//       doctors: result.recordset,
//     });
//   } catch (error) {
//     console.error("Error getting doctors for patient:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch doctors for patient",
//     });
//   }
// });

// // @route   POST api/smart-tokens/assign-enhanced
// // @desc    Enhanced token assignment with patient and doctor linking
// // @access  Private/Admin
// router.post("/assign-enhanced", auth, async (req, res) => {
//   try {
//     const {
//       tokenId,
//       containerName,
//       folderName,
//       patientName,
//       patientDateOfBirth,
//       patientUserId, // NEW: Patient user ID
//       doctorUserId, // NEW: Doctor user ID
//     } = req.body;

//     if (!tokenId || !containerName || !folderName) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields",
//       });
//     }

//     await pool.connect();

//     // Start a transaction to ensure data consistency
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // Verify patient user exists if provided
//       if (patientUserId) {
//         const patientCheck = await transaction
//           .request()
//           .input("patientUserId", patientUserId)
//           .query(
//             "SELECT userId, name FROM Users WHERE userId = @patientUserId AND role = 'patient'"
//           );

//         if (patientCheck.recordset.length === 0) {
//           await transaction.rollback();
//           return res.status(400).json({
//             success: false,
//             message: "Invalid patient user selected",
//           });
//         }
//       }

//       // Verify doctor user exists if provided
//       if (doctorUserId) {
//         const doctorCheck = await transaction
//           .request()
//           .input("doctorUserId", doctorUserId)
//           .query(
//             "SELECT userId, name FROM Users WHERE userId = @doctorUserId AND role = 'doctor'"
//           );

//         if (doctorCheck.recordset.length === 0) {
//           await transaction.rollback();
//           return res.status(400).json({
//             success: false,
//             message: "Invalid doctor user selected",
//           });
//         }
//       }

//       // Check if the patient folder is already assigned to another token
//       const existingAssignment = await transaction
//         .request()
//         .input("containerName", containerName)
//         .input("folderName", folderName)
//         .input("currentTokenId", tokenId).query(`
//           SELECT smartTokenId, patientName, assignedAt, status, patientUserId, doctorUserId
//           FROM SmartTokens 
//           WHERE containerName = @containerName 
//             AND folderName = @folderName 
//             AND smartTokenId != @currentTokenId
//             AND status = 'assigned'
//         `);

//       let previousTokenInfo = null;

//       // If patient folder is already assigned to another token, revoke the old assignment
//       if (existingAssignment.recordset.length > 0) {
//         const existingToken = existingAssignment.recordset[0];
//         previousTokenInfo = {
//           tokenId: existingToken.smartTokenId,
//           patientName: existingToken.patientName,
//           assignedAt: existingToken.assignedAt,
//           patientUserId: existingToken.patientUserId,
//           doctorUserId: existingToken.doctorUserId,
//         };

//         // Revoke the existing token assignment
//         await transaction
//           .request()
//           .input("existingTokenId", existingToken.smartTokenId)
//           .input("revokeReason", "Patient folder reassigned to new token")
//           .input("revokedBy", req.user.name || "System").query(`
//             UPDATE SmartTokens 
//             SET status = 'revoked',
//                 revokedAt = GETDATE(),
//                 revokedBy = @revokedBy,
//                 revokeReason = @revokeReason
//             WHERE smartTokenId = @existingTokenId
//           `);
//       }

//       // Check if the current token exists and its status
//       const currentTokenCheck = await transaction
//         .request()
//         .input("tokenId", tokenId).query(`
//           SELECT containerName, folderName, patientName, status
//           FROM SmartTokens 
//           WHERE smartTokenId = @tokenId
//         `);

//       if (currentTokenCheck.recordset.length === 0) {
//         await transaction.rollback();
//         return res.status(404).json({
//           success: false,
//           message: "Token not found",
//         });
//       }

//       const currentToken = currentTokenCheck.recordset[0];

//       // Check if token is already revoked
//       if (currentToken.status === "revoked") {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message:
//             "Cannot assign a revoked token. Please reactivate the token first.",
//         });
//       }

//       // Assign the token to the new patient folder with user linking
//       await transaction
//         .request()
//         .input("smartTokenId", tokenId)
//         .input("containerName", containerName)
//         .input("folderName", folderName)
//         .input("patientName", patientName)
//         .input("patientDateOfBirth", patientDateOfBirth || null)
//         .input("patientUserId", patientUserId || null)
//         .input("doctorUserId", doctorUserId || null).query(`
//           UPDATE SmartTokens 
//           SET containerName = @containerName, 
//               folderName = @folderName,
//               patientName = @patientName,
//               patientDateOfBirth = @patientDateOfBirth,
//               patientUserId = @patientUserId,
//               doctorUserId = @doctorUserId,
//               status = 'assigned', 
//               assignedAt = GETDATE()
//           WHERE smartTokenId = @smartTokenId
//         `);

//       // Commit the transaction
//       await transaction.commit();

//       // Prepare response message
//       let message = "Token assigned to patient successfully";
//       let additionalInfo = {};

//       if (previousTokenInfo) {
//         message = "Patient folder reassigned successfully";
//         additionalInfo = {
//           reassignment: true,
//           previousToken: {
//             tokenId:
//               previousTokenInfo.tokenId.substring(0, 8) +
//               "..." +
//               previousTokenInfo.tokenId.substring(
//                 previousTokenInfo.tokenId.length - 8
//               ),
//             patientName: previousTokenInfo.patientName,
//             assignedAt: previousTokenInfo.assignedAt,
//           },
//           message: `Previous token has been automatically revoked and this patient folder is now assigned to the new token.`,
//         };
//       }

//       res.json({
//         success: true,
//         message: message,
//         tokenId: tokenId,
//         patientFolder: `${containerName}/${folderName}`,
//         patientName: patientName,
//         patientUserId: patientUserId,
//         doctorUserId: doctorUserId,
//         assignedAt: new Date().toISOString(),
//         assignedBy: req.user.name,
//         ...additionalInfo,
//       });
//     } catch (transactionError) {
//       // Rollback transaction on error
//       await transaction.rollback();
//       throw transactionError;
//     }
//   } catch (error) {
//     console.error("Error assigning token:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to assign token",
//       error:
//         process.env.NODE_ENV === "development" ? error.message : "Server error",
//     });
//   }
// });

// // @route   DELETE api/smart-tokens/:tokenId
// // @desc    Delete a token (same as old API)
// // @access  Private/Admin
// router.delete("/:tokenId", auth, async (req, res) => {
//   try {
//     const { tokenId } = req.params;

//     if (!req.user || req.user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Admin access required",
//       });
//     }

//     await pool.connect();

//     // Start a transaction
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // Check if token exists
//       const tokenCheck = await transaction
//         .request()
//         .input("smartTokenId", tokenId)
//         .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

//       if (tokenCheck.recordset.length === 0) {
//         await transaction.rollback();
//         return res.status(404).json({
//           success: false,
//           message: "Token not found",
//         });
//       }

//       const token = tokenCheck.recordset[0];

//       // Store token info for response
//       const tokenInfo = {
//         tokenId: token.smartTokenId,
//         patientName: token.patientName,
//         containerName: token.containerName,
//         folderName: token.folderName,
//         status: token.status,
//         assignedAt: token.assignedAt,
//       };

//       // Delete the token completely from database
//       await transaction
//         .request()
//         .input("smartTokenId", tokenId)
//         .query("DELETE FROM SmartTokens WHERE smartTokenId = @smartTokenId");

//       // Commit the transaction
//       await transaction.commit();

//       res.json({
//         success: true,
//         message: "SmartToken deleted permanently",
//         deletedToken: {
//           tokenId:
//             tokenInfo.tokenId.substring(0, 8) +
//             "..." +
//             tokenInfo.tokenId.substring(tokenInfo.tokenId.length - 8),
//           patientName: tokenInfo.patientName,
//           patientFolder:
//             tokenInfo.containerName && tokenInfo.folderName
//               ? `${tokenInfo.containerName}/${tokenInfo.folderName}`
//               : "Not assigned",
//           status: tokenInfo.status,
//         },
//         deletedAt: new Date().toISOString(),
//         deletedBy: req.user.name,
//       });
//     } catch (transactionError) {
//       await transaction.rollback();
//       throw transactionError;
//     }
//   } catch (error) {
//     console.error("Error deleting token:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to delete token",
//     });
//   }
// });

// module.exports = router;
