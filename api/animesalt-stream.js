// api/animesalt-stream.js
// AnimeSalt stream extraction - NO DDoS, direct m3u8!
// Works for Hindi Dubbed anime

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
    console.log(`AnimeSalt: ${animeId} Ep ${episodeNum}`);
    
    // Search for anime on AnimeSalt
    const searchUrl = `https://animesalt.ac/search?keyword=${encodeURIComponent(animeId)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Accept': 'text/html'
      }
    });
    
    const searchHtml = await searchRes.text();
    
    // Extract anime URL
    const animeUrlMatch = searchHtml.match(/href=["'](\/anime\/[^"']+)[\"']/i);
    
    if (!animeUrlMatch) {
      return res.status(404).json({ 
        success: false, 
        error: 'Anime not found on AnimeSalt',
        source: 'animesalt.ac'
      });
    }
    
    const animeUrl = `https://animesalt.ac${animeUrlMatch[1]}`;
    console.log(`Found: ${animeUrl}`);
    
    // Fetch anime page
    const animeRes = await fetch(animeUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://animesalt.ac/'
      } 
    });
    const animeHtml = await animeRes.text();
    
    // Find episode link
    const epPattern = new RegExp(`href=["'](/watch/[^"']*${episodeNum}[^"']*)["']`, 'i');
    const epMatch = animeHtml.match(epPattern);
    
    if (!epMatch) {
      // Try alternative pattern
      const altMatch = animeHtml.match(/href=["'](\/watch\/[^"']+)[\"']/i);
      if (!altMatch) {
        return res.status(404).json({ success: false, error: 'Episode not found' });
      }
      var epUrl = `https://animesalt.ac${altMatch[1]}`;
    } else {
      var epUrl = `https://animesalt.ac${epMatch[1]}`;
    }
    
    console.log(`Episode: ${epUrl}`);
    
    // Fetch episode page
    const epRes = await fetch(epUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://animesalt.ac/'
      } 
    });
    const epHtml = await epRes.text();
    
    // Extract m3u8 URL (AnimeSalt uses cdn domains)
    const videoPatterns = [
      /["'](https?:\/\/as-cdn[^"']+\.m3u8[^"']*)["']/i,
      /["'](https?:\/\/[^"']*animesalt[^"']+\.m3u8[^"']*)["']/i,
      /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i
    ];
    
    let videoUrl = null;
    for (const pattern of videoPatterns) {
      const match = epHtml.match(pattern);
      if (match && match[1]) {
        videoUrl = match[1];
        console.log(`Found: ${videoUrl.substring(0, 60)}...`);
        break;
      }
    }
    
    if (!videoUrl) {
      return res.status(404).json({ 
        success: false, 
        error: 'No video sources found',
        source: 'animesalt.ac'
      });
    }
    
    // Create proxied URL for CORS bypass
    const proxiedUrl = `https://proxy-sigma-ten-63.vercel.app/api?url=${encodeURIComponent(videoUrl)}`;
    
    return res.status(200).json({
      success: true,
      source: 'animesalt.ac',
      type: 'hindi-dubbed',
      data: {
        streamUrl: proxiedUrl,
        originalUrl: videoUrl,
        referer: 'https://animesalt.ac/',
        headers: { 
          'Referer': 'https://animesalt.ac/',
          'Origin': 'https://animesalt.ac'
        }
      }
    });
    
  } catch (error) {
    console.error('AnimeSalt error:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Extraction failed: ${error.message}` 
    });
  }
}
