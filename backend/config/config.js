// config/config.js
require("dotenv").config();

module.exports = {
  // Email configuration
  emailService: process.env.EMAIL_SERVICE,
  emailUser: process.env.EMAIL_USER,
  emailPassword: process.env.EMAIL_PASSWORD,

  // Application URL
  appUrl: process.env.APP_URL,

  // Add any other configuration variables your application needs
};
