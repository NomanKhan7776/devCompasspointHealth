// // controllers/enhancedSmartTokenController.js
// // Enhanced SmartToken Controller with Patient and Doctor Assignment

// const { pool, sql } = require("../config/database");
// const originalSmartTokenController = require("./smartTokenController");

// // Get all patients for token assignment dropdown
// exports.getPatientsForTokenAssignment = async (req, res) => {
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
// };

// // Get doctors assigned to a specific patient
// exports.getDoctorsForPatient = async (req, res) => {
//   try {
//     const { patientUserId } = req.params;

//     if (!req.user || req.user.role !== "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Admin access required",
//       });
//     }

//     await pool.connect();

//     // Get doctors who have access to folders assigned to this patient
//     const result = await pool.request().input("patientUserId", patientUserId)
//       .query(`
//         SELECT DISTINCT
//           u.userId,
//           u.name,
//           u.username,
//           u.role
//         FROM Users u
//         INNER JOIN FolderAssignments fa ON u.userId = fa.userId
//         INNER JOIN SmartTokens st ON fa.containerName = st.containerName
//                                   AND fa.folderName = st.folderName
//         WHERE st.patientUserId = @patientUserId
//         AND u.role = 'doctor'
//         AND st.status = 'assigned'

//         UNION

//         -- Also include doctors who are directly assigned to patient tokens
//         SELECT DISTINCT
//           u.userId,
//           u.name,
//           u.username,
//           u.role
//         FROM Users u
//         INNER JOIN SmartTokens st ON u.userId = st.doctorUserId
//         WHERE st.patientUserId = @patientUserId
//         AND u.role = 'doctor'
//         AND st.status = 'assigned'

//         ORDER BY name
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
// };

// // Enhanced token assignment with patient and doctor linking
// exports.assignTokenToPatientEnhanced = async (req, res) => {
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

//       // If doctor is assigned, create alert for doctor notification
//       if (doctorUserId) {
//         await transaction
//           .request()
//           .input("tokenId", tokenId)
//           .input("patientUserId", patientUserId || null)
//           .input("doctorUserId", doctorUserId)
//           .input("alertType", "token_assigned")
//           .input(
//             "alertMessage",
//             `SmartToken assigned to patient ${patientName}`
//           ).query(`
//             INSERT INTO TokenAssignmentAlerts
//             (tokenId, patientUserId, doctorUserId, alertType, alertMessage)
//             VALUES (@tokenId, @patientUserId, @doctorUserId, @alertType, @alertMessage)
//           `);
//       }

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
// };

// // Get tokens associated with current user (patient or doctor)
// exports.getAssociatedTokens = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     await pool.connect();

//     let query = "";
//     let roleField = "";

//     // Different queries based on user role
//     if (req.user.role === "patient") {
//       roleField = "patientUserId";
//       query = `
//         SELECT
//           st.smartTokenId,
//           st.containerName,
//           st.folderName,
//           st.patientName,
//           st.patientDateOfBirth,
//           st.status,
//           st.assignedAt,
//           du.name as doctorName,
//           du.username as doctorUsername,
//           COUNT(df.fingerprintId) as registeredDevices
//         FROM SmartTokens st
//         LEFT JOIN Users du ON st.doctorUserId = du.userId
//         LEFT JOIN DeviceFingerprints df ON st.patientUserId = df.userId AND df.isActive = 1
//         WHERE st.patientUserId = @userId AND st.status = 'assigned'
//         GROUP BY st.smartTokenId, st.containerName, st.folderName, st.patientName,
//                  st.patientDateOfBirth, st.status, st.assignedAt, du.name, du.username
//         ORDER BY st.assignedAt DESC
//       `;
//     } else if (req.user.role === "doctor") {
//       roleField = "doctorUserId";
//       query = `
//         SELECT
//           st.smartTokenId,
//           st.containerName,
//           st.folderName,
//           st.patientName,
//           st.patientDateOfBirth,
//           st.status,
//           st.assignedAt,
//           pu.name as patientUserName,
//           pu.username as patientUsername,
//           COUNT(df.fingerprintId) as registeredDevices
//         FROM SmartTokens st
//         LEFT JOIN Users pu ON st.patientUserId = pu.userId
//         LEFT JOIN DeviceFingerprints df ON st.patientUserId = df.userId AND df.isActive = 1
//         WHERE st.doctorUserId = @userId AND st.status = 'assigned'
//         GROUP BY st.smartTokenId, st.containerName, st.folderName, st.patientName,
//                  st.patientDateOfBirth, st.status, st.assignedAt, pu.name, pu.username
//         ORDER BY st.assignedAt DESC
//       `;
//     } else {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. Only patients and doctors can view associated tokens.",
//       });
//     }

//     const result = await pool
//       .request()
//       .input("userId", req.user.userId)
//       .query(query);

//     res.json({
//       success: true,
//       tokens: result.recordset,
//       userRole: req.user.role,
//     });
//   } catch (error) {
//     console.error("Error getting associated tokens:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch associated tokens",
//     });
//   }
// };

// // Get token assignment alerts for user
// exports.getTokenAlerts = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     await pool.connect();

//     let userField = "";
//     if (req.user.role === "patient") {
//       userField = "patientUserId";
//     } else if (req.user.role === "doctor") {
//       userField = "doctorUserId";
//     } else {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied",
//       });
//     }

//     const result = await pool.request().input("userId", req.user.userId).query(`
//         SELECT
//           taa.alertId,
//           taa.tokenId,
//           taa.alertType,
//           taa.alertMessage,
//           taa.location,
//           taa.isRead,
//           taa.createdAt,
//           taa.readAt,
//           st.patientName,
//           st.containerName,
//           st.folderName
//         FROM TokenAssignmentAlerts taa
//         LEFT JOIN SmartTokens st ON taa.tokenId = st.smartTokenId
//         WHERE taa.${userField} = @userId
//         ORDER BY taa.createdAt DESC
//       `);

//     res.json({
//       success: true,
//       alerts: result.recordset,
//     });
//   } catch (error) {
//     console.error("Error getting token alerts:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch token alerts",
//     });
//   }
// };

// // Mark alert as read
// exports.markAlertAsRead = async (req, res) => {
//   try {
//     const { alertId } = req.params;

//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//       });
//     }

//     await pool.connect();

//     let userField = "";
//     if (req.user.role === "patient") {
//       userField = "patientUserId";
//     } else if (req.user.role === "doctor") {
//       userField = "doctorUserId";
//     } else {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied",
//       });
//     }

//     await pool
//       .request()
//       .input("alertId", alertId)
//       .input("userId", req.user.userId).query(`
//         UPDATE TokenAssignmentAlerts
//         SET isRead = 1, readAt = GETDATE()
//         WHERE alertId = @alertId AND ${userField} = @userId
//       `);

//     res.json({
//       success: true,
//       message: "Alert marked as read",
//     });
//   } catch (error) {
//     console.error("Error marking alert as read:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to mark alert as read",
//     });
//   }
// };

// // Admin: Get all tokens with user associations
// exports.getAllTokensWithUsers = async (req, res) => {
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
//         COUNT(df.fingerprintId) as registeredDevices
//       FROM SmartTokens st
//       LEFT JOIN Users pu ON st.patientUserId = pu.userId
//       LEFT JOIN Users du ON st.doctorUserId = du.userId
//       LEFT JOIN DeviceFingerprints df ON st.patientUserId = df.userId AND df.isActive = 1
//       GROUP BY st.smartTokenId, st.secureChipId, st.productCode, st.containerName,
//                st.folderName, st.patientName, st.patientDateOfBirth, st.status,
//                st.assignedAt, st.createdAt, pu.name, pu.username, pu.userId,
//                du.name, du.username, du.userId
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
// };

// // Export all original functions from smartTokenController as well
// module.exports = {
//   ...originalSmartTokenController,
//   getPatientsForTokenAssignment: exports.getPatientsForTokenAssignment,
//   getDoctorsForPatient: exports.getDoctorsForPatient,
//   assignTokenToPatientEnhanced: exports.assignTokenToPatientEnhanced,
//   getAssociatedTokens: exports.getAssociatedTokens,
//   getTokenAlerts: exports.getTokenAlerts,
//   markAlertAsRead: exports.markAlertAsRead,
//   getAllTokensWithUsers: exports.getAllTokensWithUsers,
// };



