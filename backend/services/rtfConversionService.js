// services/rtfConversionService.js - TXT ONLY VERSION (No RTF Storage)
const CloudConvert = require("cloudconvert");
const { blobServiceClient } = require("../config/azure-storage");

class RTFConversionService {
  constructor() {
    this.cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY);
  }

  /**
   * Check if file is RTF format
   */
  isRTFFile(filename, buffer) {
    const extension = filename.toLowerCase().endsWith(".rtf");
    const hasRTFHeader =
      buffer &&
      buffer.length > 6 &&
      (buffer.toString("ascii", 0, 6).includes("{\\rtf") ||
        buffer.toString("utf8", 0, 6).includes("{\\rtf"));
    return extension || hasRTFHeader;
  }

  /**
   * Convert RTF to TXT using CloudConvert
   */
  async convertRTFToTXT(rtfBuffer, originalFilename) {
    try {
      // Create CloudConvert job
      const job = await this.cloudConvert.jobs.create({
        tasks: {
          "import-rtf": {
            operation: "import/upload",
          },
          "convert-to-txt": {
            operation: "convert",
            input: "import-rtf",
            input_format: "rtf",
            output_format: "txt",
            options: {
              line_ending: "lf",
            },
          },
          "export-txt": {
            operation: "export/url",
            input: "convert-to-txt",
          },
        },
      });

      // Upload RTF file
      const importTask = job.tasks.filter(
        (task) => task.name === "import-rtf"
      )[0];

      await this.cloudConvert.tasks.upload(
        importTask,
        rtfBuffer,
        originalFilename
      );

      // Wait for job completion
      const completedJob = await this.waitForJobCompletion(job.id, 120000);

      // Get the converted TXT file
      const exportTask = completedJob.tasks.filter(
        (task) => task.name === "export-txt"
      )[0];

      if (
        !exportTask.result ||
        !exportTask.result.files ||
        exportTask.result.files.length === 0
      ) {
        throw new Error("No converted file found in CloudConvert response");
      }

      const txtFileUrl = exportTask.result.files[0].url;

      // Download the converted TXT content
      const axios = require("axios");
      const response = await axios.get(txtFileUrl, {
        responseType: "arraybuffer",
      });
      const txtBuffer = Buffer.from(response.data);

      return {
        success: true,
        txtBuffer,
        originalSize: rtfBuffer.length,
        convertedSize: txtBuffer.length,
        jobId: job.id,
      };
    } catch (error) {
      console.error("CloudConvert RTF to TXT conversion failed:", error);
      throw new Error(`RTF conversion failed: ${error.message}`);
    }
  }

  /**
   * Wait for CloudConvert job completion
   */
  async waitForJobCompletion(jobId, timeout = 120000) {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeout) {
      try {
        const job = await this.cloudConvert.jobs.get(jobId);

        if (job.status === "finished") {
          return job;
        } else if (job.status === "error") {
          const errorMessage =
            job.tasks.find((task) => task.status === "error")?.message ||
            "Unknown error";
          throw new Error(`CloudConvert job failed: ${errorMessage}`);
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error("Error polling CloudConvert job:", error);
        throw error;
      }
    }

    throw new Error(`CloudConvert job timeout after ${timeout}ms`);
  }

  /**
   * Process RTF file and create ONLY TXT version (no RTF storage)
   */
  async processRTFFileToTxtOnly(
    containerName,
    folderName,
    rtfFileName,
    rtfBuffer
  ) {
    try {
      // Convert RTF to TXT
      const conversionResult = await this.convertRTFToTXT(
        rtfBuffer,
        rtfFileName
      );

      if (!conversionResult.success) {
        throw new Error("RTF to TXT conversion failed");
      }

      // Generate TXT filename from RTF filename
      const txtFileName = this.generateTxtFileName(rtfFileName);

      // Upload ONLY TXT file to Azure Blob Storage
      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      const txtBlobName = `${folderName}/${txtFileName}`;
      const txtBlobClient = containerClient.getBlobClient(txtBlobName);
      const txtBlockBlobClient = txtBlobClient.getBlockBlobClient();

      await txtBlockBlobClient.upload(
        conversionResult.txtBuffer,
        conversionResult.txtBuffer.length,
        {
          blobHTTPHeaders: {
            blobContentType: "text/plain",
          },
          metadata: {
            originalRtfFileName: rtfFileName,
            conversionMethod: "cloudconvert",
            convertedAt: new Date().toISOString(),
            originalSize: conversionResult.originalSize.toString(),
            convertedSize: conversionResult.convertedSize.toString(),
            rtfConvertedOnly: "true", // Flag to indicate this was RTF converted to TXT only
          },
        }
      );

      return {
        success: true,
        txtFileName,
        txtBlobName,
        originalSize: conversionResult.originalSize,
        convertedSize: conversionResult.convertedSize,
        message: `RTF file converted and saved as TXT only`,
      };
    } catch (error) {
      console.error("RTF processing error:", error);
      throw error;
    }
  }

  /**
   * Generate TXT filename from RTF filename
   */
  generateTxtFileName(rtfFileName) {
    const baseName = rtfFileName.replace(/\.rtf$/i, "");
    return `${baseName}.txt`;
  }
}

module.exports = new RTFConversionService();
