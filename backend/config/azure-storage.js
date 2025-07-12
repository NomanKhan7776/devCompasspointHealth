
const { BlobServiceClient } = require("@azure/storage-blob");
const dotenv = require("dotenv");

dotenv.config();

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

module.exports = {
  blobServiceClient,
};
