import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { messages, locationContext } = await req.json();

    // Build system prompt with location data context
    const systemPrompt = `You are a helpful assistant that answers questions about the user's location history and travel data. You have access to their complete location timeline.

Here is a summary of their location data:
${locationContext.summary}

Here are their recent visits (sample):
${locationContext.recentVisits}

Here are statistics about their travels:
- Total visits: ${locationContext.stats.totalVisits}
- Total places: ${locationContext.stats.totalPlaces}
- Countries visited: ${locationContext.stats.countries}
- Date range: ${locationContext.stats.dateRange}

When answering questions:
- Be specific with dates, places, and times when available
- If you don't have enough data to answer precisely, say so
- Format dates nicely (e.g., "September 15, 2022")
- Be conversational and helpful
- If asked about patterns or insights, analyze the data thoughtfully`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    });

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

