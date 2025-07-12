// routes/users.js
const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");
const { getAllUsersWithAssignments } = require("../controllers/userController");

// @route   GET api/users
// @desc    Get all users
// @access  Private/Admin
router.get("/", auth, checkRole(["admin"]), getAllUsers);



router.get('/with-assignments', auth, checkRole(['admin']), getAllUsersWithAssignments);

// @route   GET api/users/:id
// @desc    Get user by ID
// @access  Private/Admin
router.get("/:id", auth, checkRole(["admin"]), getUserById);

// @route   PUT api/users/:id
// @desc    Update user
// @access  Private/Admin
router.put("/:id", auth, checkRole(["admin"]), updateUser);

// @route   DELETE api/users/:id
// @desc    Delete user
// @access  Private/Admin
router.delete("/:id", auth, checkRole(["admin"]), deleteUser);

module.exports = router;
