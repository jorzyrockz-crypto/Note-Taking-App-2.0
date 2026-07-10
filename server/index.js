import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importRecipeFromUrl, RecipeImportError } from './recipe-import-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '1mb' }));

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

app.use(express.static(rootDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`AtlasNest server listening at http://localhost:${port}`);
});
