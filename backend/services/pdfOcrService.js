// services/pdfOcrService.js
const {
  ComputerVisionClient,
} = require("@azure/cognitiveservices-computervision");
const { ApiKeyCredentials } = require("@azure/ms-rest-js");
const { blobServiceClient } = require("../config/azure-storage");

class PDFOcrService {
  constructor() {
    this.client = new ComputerVisionClient(
      new ApiKeyCredentials({
        inHeader: {
          "Ocp-Apim-Subscription-Key":
            process.env.AZURE_COMPUTER_VISION_API_KEY,
        },
      }),
      process.env.AZURE_COMPUTER_VISION_ENDPOINT
    );
  }

  // Check if file is a scanned PDF
  isScannedPDF(filename, buffer) {
    const isPDF = filename.toLowerCase().endsWith(".pdf");
    if (!isPDF) return false;

    // Additional logic can be added here to detect if PDF contains images
    return true; // For now, assume all PDFs might be scanned
  }

  // Convert PDF to text using Azure Computer Vision
  async convertPDFToText(pdfBuffer, originalFilename) {
    try {
      // Upload PDF buffer to temporary blob for OCR processing
      const tempBlobName = `temp-ocr/${Date.now()}-${originalFilename}`;
      const containerClient =
        blobServiceClient.getContainerClient("temp-processing");

      // Ensure temp container exists
      await containerClient.createIfNotExists();

      const tempBlobClient = containerClient.getBlobClient(tempBlobName);
      await tempBlobClient
        .getBlockBlobClient()
        .upload(pdfBuffer, pdfBuffer.length);

      // Get temporary URL for OCR processing
      const tempUrl = tempBlobClient.url;

      // Process with Computer Vision OCR
      const result = await this.client.readInStream(pdfBuffer);

      // Get operation ID from result headers
      const operationId = result.operationLocation.split("/").slice(-1)[0];

      // Poll for results
      let ocrResult;
      do {
        await this.delay(1000); // Wait 1 second
        ocrResult = await this.client.getReadResult(operationId);
      } while (
        ocrResult.status === "running" ||
        ocrResult.status === "notStarted"
      );

      if (ocrResult.status === "failed") {
        throw new Error("OCR processing failed");
      }

      // Extract text from all pages
      let extractedText = "";
      if (ocrResult.analyzeResult && ocrResult.analyzeResult.readResults) {
        ocrResult.analyzeResult.readResults.forEach((page) => {
          page.lines.forEach((line) => {
            extractedText += line.text + "\n";
          });
        });
      }

      // Clean up temporary blob
      await tempBlobClient.delete();

      return {
        success: true,
        extractedText,
        originalSize: pdfBuffer.length,
        textSize: Buffer.byteLength(extractedText, "utf8"),
        pageCount: ocrResult.analyzeResult?.readResults?.length || 1,
      };
    } catch (error) {
      console.error("Azure Computer Vision OCR failed:", error);
      throw new Error(`PDF OCR conversion failed: ${error.message}`);
    }
  }

  // Process PDF and save as TXT
  async processPDFToTxtOnly(containerName, folderName, pdfFileName, pdfBuffer) {
    try {
      // Convert PDF to text
      const ocrResult = await this.convertPDFToText(pdfBuffer, pdfFileName);

      if (!ocrResult.success) {
        throw new Error("PDF to text conversion failed");
      }

      // Generate TXT filename
      const txtFileName = this.generateTxtFileName(pdfFileName);

      // Upload TXT file to Azure Blob Storage
      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      const txtBlobName = `${folderName}/${txtFileName}`;
      const txtBlobClient = containerClient.getBlobClient(txtBlobName);
      const txtBlockBlobClient = txtBlobClient.getBlockBlobClient();

      const textBuffer = Buffer.from(ocrResult.extractedText, "utf8");

      await txtBlockBlobClient.upload(textBuffer, textBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: "text/plain",
        },
        metadata: {
          originalPdfFileName: pdfFileName,
          ocrMethod: "azure-computer-vision",
          convertedAt: new Date().toISOString(),
          originalSize: ocrResult.originalSize.toString(),
          textSize: ocrResult.textSize.toString(),
          pageCount: ocrResult.pageCount.toString(),
          pdfConvertedOnly: "true",
        },
      });

      return {
        success: true,
        txtFileName,
        txtBlobName,
        originalSize: ocrResult.originalSize,
        textSize: ocrResult.textSize,
        pageCount: ocrResult.pageCount,
        message: `PDF converted to text and saved as ${txtFileName}`,
      };
    } catch (error) {
      console.error("PDF processing error:", error);
      throw error;
    }
  }

  // Generate TXT filename from PDF filename
  generateTxtFileName(pdfFileName) {
    const baseName = pdfFileName.replace(/\.pdf$/i, "");
    return `${baseName}.txt`;
  }

  // Helper delay function
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new PDFOcrService();
