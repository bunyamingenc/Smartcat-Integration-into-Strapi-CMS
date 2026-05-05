// strapiClient.js
// Fetches content from Strapi and extracts translatable fields

import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const STRAPI_URL = process.env.STRAPI_URL;
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

// Fields we want to send for translation
const TRANSLATABLE_FIELDS = ["title", "shortDescription", "body"];

const strapiAPI = axios.create({
  baseURL: STRAPI_URL,
  headers: {
    Authorization: `Bearer ${STRAPI_API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

/**
 * Fetch a single article by its Strapi document ID in the source locale.
 * @param {string} documentId  - Strapi document ID (e.g. "abc123xyz")
 * @param {string} locale      - source locale (e.g. "en")
 * @returns {object}           - raw Strapi article data
 */
export async function fetchArticle(documentId, locale = process.env.STRAPI_SOURCE_LOCALE) {
  try {
    const response = await strapiAPI.get(
      `/api/${process.env.STRAPI_CONTENT_TYPE}/${documentId}?locale=${locale}&populate=*`
    );
    return response.data.data;
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    throw new Error(`Failed to fetch article [${documentId}] (${status}): ${message}`);
  }
}

/**
 * Extract only translatable fields from a Strapi article
 * and return them as a flat key-value object for Smartcat.
 * @param {string} contentId   - your logical content ID (e.g. "article-804")
 * @param {object} articleData - raw data from fetchArticle()
 * @returns {object}           - flat payload ready for Smartcat
 */
export function extractTranslatableFields(contentId, articleData) {
  const attributes = articleData.attributes ?? articleData; // Strapi v4 vs v5

  const missing = [];
  const payload = {};

  for (const field of TRANSLATABLE_FIELDS) {
    const value = attributes[field];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
      continue;
    }
    payload[`${contentId}.${field}`] = value;
  }

  if (missing.length > 0) {
    console.warn(`[strapiClient] Missing fields for "${contentId}": ${missing.join(", ")}`);
  }

  return payload;
}

/**
 * Write a translated locale version back to a Strapi article.
 * @param {string} documentId  - Strapi document ID
 * @param {string} locale      - target locale (e.g. "tr" or "es")
 * @param {object} fields      - translated field values { title, shortDescription, body }
 */
export async function updateArticleLocale(documentId, locale, fields) {
  try {
    await strapiAPI.put(`/api/${process.env.STRAPI_CONTENT_TYPE}/${documentId}?locale=${locale}`, {
      data: fields,
    });
    console.log(`[strapiClient] Updated "${documentId}" for locale "${locale}"`);
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    throw new Error(`Failed to update article [${documentId}] locale [${locale}] (${status}): ${message}`);
  }
}
