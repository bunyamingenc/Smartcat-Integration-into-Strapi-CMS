// smartcatClient.js
// Handles all communication with the Smartcat API

import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const SMARTCAT_SERVER   = process.env.SMARTCAT_SERVER;
const SMARTCAT_ACCOUNT  = process.env.SMARTCAT_ACCOUNT_ID;
const SMARTCAT_KEY      = process.env.SMARTCAT_API_KEY;
const PROJECT_ID        = process.env.SMARTCAT_PROJECT_ID;

// Base64 encode "accountId:apiKey" for Basic Auth
const AUTH_HEADER = "Basic " + Buffer.from(`${SMARTCAT_ACCOUNT}:${SMARTCAT_KEY}`).toString("base64");

const smartcatAPI = axios.create({
  baseURL: `${SMARTCAT_SERVER}/api/integration`,
  headers: {
    Authorization: AUTH_HEADER,
    "Content-Type": "application/json",
  },
});

/**
 * Test authentication — confirms your credentials are valid.
 * Calls GET /v1/account and logs the account name.
 */
export async function testAuth() {
  try {
    const response = await smartcatAPI.get("/v1/account");
    console.log(`[smartcatClient] Auth OK — account: "${response.data.name}"`);
    return true;
  } catch (error) {
    const status = error.response?.status;
    throw new Error(`Smartcat auth failed (${status}). Check SMARTCAT_ACCOUNT_ID and SMARTCAT_API_KEY in .env`);
  }
}

/**
 * Fetch the current Smartcat project to confirm it exists and is accessible.
 */
export async function getProject() {
  try {
    const response = await smartcatAPI.get(`/v1/project/${PROJECT_ID}`);
    const { name, status, targetLanguages } = response.data;
    console.log(`[smartcatClient] Project found: "${name}" | status: ${status} | languages: ${targetLanguages.join(", ")}`);
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    throw new Error(`Failed to fetch Smartcat project (${status}). Check SMARTCAT_PROJECT_ID in .env`);
  }
}

/**
 * Fetch all documents in the project and their translation status.
 * Returns a list of { documentId, name, status, targetLanguage }
 */
export async function getDocumentStatuses() {
  try {
    const project = await smartcatAPI.get(`/v1/project/${PROJECT_ID}`);
    const documents = project.data.documents ?? [];

    return documents.map((doc) => ({
      documentId: doc.id,
      name: doc.name,
      status: doc.status,
      targetLanguage: doc.targetLanguage,
      wordsCount: doc.wordsCount,
      progress: doc.progress,
    }));
  } catch (error) {
    const status = error.response?.status;
    throw new Error(`Failed to fetch document statuses (${status})`);
  }
}

/**
 * Request an export of translated content for a specific document and language.
 * Returns an exportTaskId you can poll or download from.
 * @param {string} documentId     - Smartcat document+language ID (format: "docId_languageId")
 */
export async function requestExport(documentId) {
  try {
    const response = await smartcatAPI.post(
      `/v1/document/export?documentIds=${documentId}`
    );
    const taskId = response.data.id;
    console.log(`[smartcatClient] Export task created: ${taskId}`);
    return taskId;
  } catch (error) {
    const status = error.response?.status;
    throw new Error(`Failed to request export for document [${documentId}] (${status})`);
  }
}

/**
 * Download the translated file once the export task is ready.
 * Returns the raw JSON content as a parsed object.
 * @param {string} taskId - exportTaskId from requestExport()
 */
export async function downloadExport(taskId) {
  try {
    const response = await smartcatAPI.get(`/v1/document/export/${taskId}`, {
      responseType: "text",
      headers: {
        Authorization: AUTH_HEADER,
        Accept: "application/octet-stream",
      },
    });

    // Parse the flat JSON translation payload
    const parsed = JSON.parse(response.data);
    console.log(`[smartcatClient] Downloaded export — ${Object.keys(parsed).length} keys`);
    return parsed;
  } catch (error) {
    if (error.response?.status === 204) {
      // 204 = export not ready yet
      return null;
    }
    const status = error.response?.status;
    throw new Error(`Failed to download export [${taskId}] (${status})`);
  }
}
