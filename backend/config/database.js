// config/database.js
const sql = require("mssql");
const dotenv = require("dotenv");

dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // For Azure SQL
    trustServerCertificate: false,
  },
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

poolConnect.catch((err) => {
  console.error("Error connecting to database:", err);
});

module.exports = {
  pool,
  sql,
};
