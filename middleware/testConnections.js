// testConnections.js
// Run this first to verify both Strapi and Smartcat are reachable
// Usage: node testConnections.js

import dotenv from "dotenv";
dotenv.config();

import { fetchArticle } from "./strapiClient.js";
import { testAuth, getProject } from "./smartcatClient.js";

async function run() {
  console.log("=== Connection Test ===\n");

  // 1. Test Smartcat auth
  console.log("1. Testing Smartcat authentication...");
  try {
    await testAuth();
  } catch (err) {
    console.error(`   ✗ ${err.message}`);
    process.exit(1);
  }

  // 2. Test Smartcat project access
  console.log("2. Fetching Smartcat project...");
  try {
    await getProject();
  } catch (err) {
    console.error(`   ✗ ${err.message}`);
    process.exit(1);
  }

  // 3. Test Strapi connection — list articles
  console.log("3. Testing Strapi connection...");
  try {
    const response = await fetch(
      `${process.env.STRAPI_URL}/api/test-articles?locale=${process.env.STRAPI_SOURCE_LOCALE}&pagination[pageSize]=3`,
      {
        headers: {
          Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
        },
      }
    );
    const data = await response.json();
    const articles = data.data ?? [];
    if (articles.length === 0) {
      console.warn("   ⚠  Strapi connected but no articles found. Create at least one article in the CMS.");
    } else {
      console.log(`   ✓ Strapi connected — found ${articles.length} article(s)`);
      console.log("\n   Available articles:");
      articles.forEach((a) => {
        const id = a.documentId ?? a.id;
        const title = a.title ?? a.attributes?.title ?? "(no title)";
        console.log(`     - documentId: ${id}  |  title: "${title}"`);
      });
      console.log("\n   Copy a documentId above and use it in the next step.");
    }
  } catch (err) {
    console.error(`   ✗ Strapi connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log("\n=== All connections OK ===\n");
}

run();
