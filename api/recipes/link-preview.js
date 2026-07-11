import { getLinkPreview, LinkPreviewError } from '../server/link-preview-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.', code: 'method_not_allowed' });
    return;
  }

  try {
    const result = await getLinkPreview(req.body?.url);
    res.status(200).json(result);
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
}
