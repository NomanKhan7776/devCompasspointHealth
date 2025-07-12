// routes/assignments.js
const express = require("express");
const router = express.Router();
const {
  getAllContainers,
  getContainerFolders,
  assignContainerToUser,
  assignFoldersToUser,
  getUserAssignments,
  revokeAssignment,
  getMyAssignments,
} = require("../controllers/assignmentController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// @route   GET api/assignments/containers
// @desc    Get all containers
// @access  Private/Admin
router.get("/containers", auth, checkRole(["admin"]), getAllContainers);

// @route   GET api/assignments/containers/:containerName/folders
// @desc    Get all folders in a container
// @access  Private/Admin
router.get(
  "/containers/:containerName/folders",
  auth,
  checkRole(["admin"]),
  getContainerFolders
);

// @route   POST api/assignments/containers/:containerName/users/:userId
// @desc    Assign container to user
// @access  Private/Admin
router.post(
  "/containers/:containerName/users/:userId",
  auth,
  checkRole(["admin"]),
  assignContainerToUser
);

// @route   POST api/assignments/containers/:containerName/folders
// @desc    Assign folders to user
// @access  Private/Admin
router.post(
  "/containers/:containerName/folders",
  auth,
  checkRole(["admin"]),
  assignFoldersToUser
);

// @route   GET api/assignments/users/:userId
// @desc    Get user assignments
// @access  Private/Admin
router.get("/users/:userId", auth, checkRole(["admin"]), getUserAssignments);

// @route   DELETE api/assignments/:assignmentId
// @desc    Revoke assignment
// @access  Private/Admin
router.delete("/:assignmentId", auth, checkRole(["admin"]), revokeAssignment);

router.get('/my-assignments', auth, getMyAssignments);

module.exports = router;
