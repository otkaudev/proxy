// api/animex-stream.js
// Animex.one stream extraction - DIRECT URL (no search needed!)

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
    
    // Try direct URL first (most reliable)
    const animeUrl = `https://animex.one/anime/${animeId}`;
    console.log(`Direct URL: ${animeUrl}`);
    
    const animeRes = await fetch(animeUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://animex.one/'
      } 
    });
    
    if (!animeRes.ok) {
      // Try with dashes replaced by spaces
      const altAnimeId = animeId.replace(/-/g, ' ');
      const altUrl = `https://animex.one/anime/${encodeURIComponent(altAnimeId)}`;
      console.log(`Trying alternative: ${altUrl}`);
      
      const altRes = await fetch(altUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!altRes.ok) {
        return res.status(404).json({ 
          success: false, 
          error: `Anime not found. Try searching on animex.one for the correct ID.`,
          tried: [animeUrl, altUrl]
        });
      }
    }
    
    const animeHtml = await (animeRes.ok ? animeRes : altRes).text();
    console.log(`Anime page: ${animeHtml.length} bytes`);
    
    // Find episode list
    const epPatterns = [
      new RegExp(`href=["'](/episode/[^"']*${episodeNum}[^"']*)["']`, 'i'),
      new RegExp(`href=["'](/watch/[^"']*${episodeNum}[^"']*)["']`, 'i'),
      /href=["']\/episode\/([^"']+)["']/i
    ];
    
    let episodePath = null;
    for (const pattern of epPatterns) {
      const match = animeHtml.match(pattern);
      if (match) {
        episodePath = match[1];
        console.log(`Found episode path: ${episodePath}`);
        break;
      }
    }
    
    if (!episodePath) {
      return res.status(404).json({ 
        success: false, 
        error: `Episode ${episodeNum} not found`,
        anime: animeId
      });
    }
    
    const epUrl = `https://animex.one${episodePath}`;
    console.log(`Episode: ${epUrl}`);
    
    // Fetch episode page
    const epRes = await fetch(epUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://animex.one/'
      } 
    });
    
    if (!epRes.ok) {
      return res.status(404).json({ success: false, error: 'Episode page not accessible' });
    }
    
    const epHtml = await epRes.text();
    
    // Extract video URL
    const videoMatch = epHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    
    if (!videoMatch) {
      return res.status(404).json({ 
        success: false, 
        error: 'No video found',
        debug: 'm3u8 not found in page'
      });
    }
    
    const videoUrl = videoMatch[1];
    console.log(`Video: ${videoUrl.substring(0, 60)}...`);
    
    // Return proxied URL
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
    console.error('Animex error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
