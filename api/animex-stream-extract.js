// api/animex-stream.js
// Animex.one stream extraction endpoint
// No DDoS protection - works perfectly!

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { animeId, episodeId, episodeNum } = req.query;
  
  if (!animeId || !episodeNum) {
    return res.status(400).json({ 
      error: 'Missing parameters',
      required: ['animeId', 'episodeNum']
    });
  }
  
  try {
    console.log(`Searching Animex.one for: ${animeId} Episode ${episodeNum}`);
    
    // Step 1: Search for anime on Animex.one
    const searchUrl = `https://animex.one/search?keyword=${encodeURIComponent(animeId.replace(/-/g, ' '))}`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
      }
    });
    
    if (!searchResponse.ok) {
      return res.status(500).json({
        success: false,
        error: `Search failed: ${searchResponse.status}`
      });
    }
    
    const searchHtml = await searchResponse.text();
    
    // Extract anime URL from search results
    const animeUrlMatch = searchHtml.match(/href=["'](\/anime\/[^"']+)[\"']/i);
    
    if (!animeUrlMatch) {
      return res.status(404).json({
        success: false,
        error: 'Anime not found on Animex.one'
      });
    }
    
    const animeUrl = `https://animex.one${animeUrlMatch[1]}`;
    console.log(`Found anime page: ${animeUrl}`);
    
    // Step 2: Fetch anime page to get episodes
    const animeResponse = await fetch(animeUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
      }
    });
    
    const animeHtml = await animeResponse.text();
    
    // Step 3: Find episode link
    const episodePattern = new RegExp(`href=["'](/episode/[^"']*${episodeNum}[^"']*)["']`, 'i');
    const episodeMatch = animeHtml.match(episodePattern);
    
    if (!episodeMatch) {
      // Try alternative pattern
      const altPattern = /href=["'](\/episode\/[^"']+)[\"']/gi;
      let match;
      const episodes = [];
      while ((match = altPattern.exec(animeHtml)) !== null) {
        episodes.push(match[1]);
      }
      
      if (episodes.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No episodes found'
        });
      }
      
      // Use first episode if specific one not found
      var episodeUrl = `https://animex.one${episodes[0]}`;
    } else {
      var episodeUrl = `https://animex.one${episodeMatch[1]}`;
    }
    
    console.log(`Episode page: ${episodeUrl}`);
    
    // Step 4: Fetch episode page and extract video URL
    const episodeResponse = await fetch(episodeUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Referer': 'https://animex.one/'
      }
    });
    
    const episodeHtml = await episodeResponse.text();
    
    // Step 5: Extract video URL (look for .m3u8 or .mp4)
    const videoPatterns = [
      /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
      /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
      /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i,
      /data-url=["']([^"']+\.m3u8[^"']*)["']/i
    ];
    
    let videoUrl = null;
    for (const pattern of videoPatterns) {
      const match = episodeHtml.match(pattern);
      if (match && match[1]) {
        videoUrl = match[1];
        console.log(`Found video URL: ${videoUrl.substring(0, 50)}...`);
        break;
      }
    }
    
    if (!videoUrl) {
      // Try to find iframe with video
      const iframeMatch = episodeHtml.match(/<iframe[^>]+src=["']([^"']+)[\"'][^>]*>/i);
      if (iframeMatch && iframeMatch[1]) {
        console.log(`Found iframe: ${iframeMatch[1].substring(0, 50)}...`);
        
        // Fetch iframe content
        const iframeResponse = await fetch(iframeMatch[1], {
          headers: {
            'Referer': episodeUrl,
            'User-Agent': 'Mozilla/5.0'
          }
        });
        
        const iframeHtml = await iframeResponse.text();
        
        // Extract from iframe
        for (const pattern of videoPatterns) {
          const match = iframeHtml.match(pattern);
          if (match && match[1]) {
            videoUrl = match[1];
            console.log(`Found video in iframe: ${videoUrl.substring(0, 50)}...`);
            break;
          }
        }
      }
    }
    
    if (!videoUrl) {
      return res.status(404).json({
        success: false,
        error: 'No video sources found on Animex.one',
        debug: {
          episodeUrl: episodeUrl,
          pageSize: episodeHtml.length
        }
      });
    }
    
    // Create proxied URL for CORS bypass
    const proxiedUrl = `https://proxy-sigma-ten-63.vercel.app/api?url=${encodeURIComponent(videoUrl)}`;
    
    console.log('Animex.one extraction successful!');
    
    return res.status(200).json({
      success: true,
      source: 'animex.one',
      data: {
        streamUrl: proxiedUrl,
        originalUrl: videoUrl,
        referer: 'https://animex.one/',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        headers: {
          'Referer': 'https://animex.one/',
          'Origin': 'https://animex.one'
        }
      }
    });
    
  } catch (error) {
    console.error('Animex.one extraction error:', error);
    return res.status(500).json({
      success: false,
      error: `Extraction failed: ${error.message}`
    });
  }
}
