import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importRecipeFromUrl, RecipeImportError } from './recipe-import-service.js';
import { getLinkPreview, LinkPreviewError } from './link-preview-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'AtlasNest',
    recipeImporter: true
  });
});

app.post('/api/recipes/import', async (req, res) => {
  try {
    const url = req.body?.url;
    const result = await importRecipeFromUrl(url);
    res.json(result);
  } catch (error) {
    if (error instanceof RecipeImportError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    console.error('Unexpected recipe import failure:', error);
    res.status(500).json({
      error: 'Unexpected recipe import error.',
      code: 'internal_error'
    });
  }
});

app.post('/api/link-preview', async (req, res) => {
  try {
    const url = req.body?.url;
    const result = await getLinkPreview(url);
    res.json(result);
  } catch (error) {
    if (error instanceof LinkPreviewError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    console.error('Unexpected link preview failure:', error);
    res.status(500).json({
      error: 'Unexpected link preview error.',
      code: 'internal_error'
    });
  }
});

app.use(express.static(path.join(rootDir, 'public')));
app.use(express.static(rootDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(port, host, () => {
  const lanUrls = getLanUrls(port);
  console.log(`AtlasNest server listening at http://localhost:${port}`);
  if (lanUrls.length > 0) {
    console.log(`Open from another device on the same Wi-Fi: ${lanUrls.join(' or ')}`);
  }
});

function getLanUrls(portNumber) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => `http://${entry.address}:${portNumber}`);
}
