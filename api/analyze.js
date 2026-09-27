 Fichier : api/analyze.js dans ton dépôt GitHub "studycards-api"
// Reçoit des photos en base64 depuis StudyCards, appelle Gemini (gratuit), renvoie des flashcards en JSON.

export default async function handler(req, res) {
  // Autorise StudyCards (hébergé ailleurs) à appeler cette fonction
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { photos } = req.body; // tableau de data URLs base64 (image/jpeg;base64,...)
    if (!photos || !photos.length) {
      return res.status(400).json({ error: 'Aucune photo reçue' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API non configurée sur le serveur' });

    // Prépare les images pour Gemini
    const imageParts = photos.map(dataUrl => {
      const [meta, base64] = dataUrl.split(',');
      const mimeType = meta.match(/data:(.*);base64/)[1];
      return { inline_data: { mime_type: mimeType, data: base64 } };
    });

    const prompt = `Tu es un assistant pédagogique. Analyse UNIQUEMENT le contenu visible sur ces photos de cours.
RÈGLES STRICTES :
- Base-toi UNIQUEMENT sur les informations présentes dans les images fournies.
- N'ajoute AUCUNE connaissance générale extérieure, même si elle semble pertinente.
- N'invente rien.
- Si une notion est ambiguë ou incomplète dans le cours, ne complète pas avec tes propres connaissances.

Génère entre 5 et 15 flashcards recto/verso à partir de ce cours.
Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour, sans balises markdown, au format exact :
[{"front":"question ou terme","back":"réponse ou définition"}, ...]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...imageParts] }],
          generationConfig: { temperature: 0.2 }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erreur Gemini' });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json|```/g, '').trim();

    let cards;
    try { cards = JSON.parse(text); }
    catch (e) { return res.status(500).json({ error: "Réponse de l'IA illisible, réessaie." }); }

    return res.status(200).json({ cards });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur : ' + err.message });
  }
}
