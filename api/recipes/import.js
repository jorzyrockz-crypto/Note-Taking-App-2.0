import { importRecipeFromUrl, RecipeImportError } from '../../server/recipe-import-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.', code: 'method_not_allowed' });
    return;
  }

  try {
    const result = await importRecipeFromUrl(req.body?.url);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof RecipeImportError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    res.status(500).json({
      error: 'Unexpected recipe import error.',
      code: 'internal_error'
    });
  }
}
