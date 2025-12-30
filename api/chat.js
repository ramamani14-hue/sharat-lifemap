export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, locationContext } = req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Build system prompt with location data context
    const systemPrompt = `You are a helpful assistant that answers questions about the user's location history and travel data. You have access to their complete location timeline.

Here is a summary of their location data:
${locationContext?.summary || 'No summary available'}

Here are their recent visits (sample):
${locationContext?.recentVisits || 'No recent visits'}

Here are statistics about their travels:
- Total visits: ${locationContext?.stats?.totalVisits || 0}
- Total places: ${locationContext?.stats?.totalPlaces || 0}
- Countries visited: ${locationContext?.stats?.countries || 'Unknown'}
- Date range: ${locationContext?.stats?.dateRange || 'Unknown'}

When answering questions:
- Be specific with dates, places, and times when available
- If you don't have enough data to answer precisely, say so
- Format dates nicely (e.g., "September 15, 2022")
- Be conversational and helpful
- If asked about patterns or insights, analyze the data thoughtfully`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return res.status(500).json({ error: errorData.error?.message || 'OpenAI API error' });
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || '';
    
    res.status(200).json({ content: assistantMessage });
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
