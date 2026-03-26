// api/animex-stream.js
// Animex.one stream extraction - NO DDoS protection!

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { animeId, episodeNum } = req.query;
  
  if (!animeId || !episodeNum) {
    return res.status(400).json({ error: 'Missing animeId or episodeNum' });
  }
  
  try {
    console.log(`Animex.one: ${animeId} Ep ${episodeNum}`);
    
    // Search for anime
    const searchUrl = `https://animex.one/search?keyword=${encodeURIComponent(animeId)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0' }
    });
    
    const searchHtml = await searchRes.text();
    const animeUrlMatch = searchHtml.match(/href=["'](\/anime\/[^"']+)[\"']/i);
    
    if (!animeUrlMatch) {
      return res.status(404).json({ success: false, error: 'Anime not found' });
    }
    
    const animeUrl = `https://animex.one${animeUrlMatch[1]}`;
    const animeRes = await fetch(animeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const animeHtml = await animeRes.text();
    
    // Find episode
    const epPattern = new RegExp(`href=["'](/episode/[^"']*${episodeNum}[^"']*)["']`, 'i');
    const epMatch = animeHtml.match(epPattern);
    
    if (!epMatch) {
      return res.status(404).json({ success: false, error: 'Episode not found' });
    }
    
    const epUrl = `https://animex.one${epMatch[1]}`;
    const epRes = await fetch(epUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://animex.one/' } });
    const epHtml = await epRes.text();
    
    // Extract video URL
    const videoMatch = epHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    
    if (!videoMatch) {
      return res.status(404).json({ success: false, error: 'No video found' });
    }
    
    const videoUrl = videoMatch[1];
    const proxiedUrl = `https://proxy-sigma-ten-63.vercel.app/api?url=${encodeURIComponent(videoUrl)}`;
    
    return res.status(200).json({
      success: true,
      source: 'animex.one',
      data: {
        streamUrl: proxiedUrl,
        originalUrl: videoUrl,
        referer: 'https://animex.one/',
        headers: { 'Referer': 'https://animex.one/' }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
