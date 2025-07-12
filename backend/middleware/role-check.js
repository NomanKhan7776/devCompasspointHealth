// middleware/role-check.js
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const hasRole = roles.find((role) => req.user.role === role);
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden",
      });
    }

    next();
  };
};

module.exports = { checkRole };
