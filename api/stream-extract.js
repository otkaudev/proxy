// api/stream-extract.js
// Stream extraction endpoint for Anivu app
// Extracts video URLs from animepahe.si and returns proxied stream

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
  
  const { animeId, episodeId } = req.query;
  
  if (!animeId || !episodeId) {
    return res.status(400).json({ 
      error: 'Missing parameters',
      required: ['animeId', 'episodeId']
    });
  }
  
  try {
    console.log(`Extracting stream for: ${animeId} / ${episodeId}`);
    
    // Build animepahe episode URL
    const episodeUrl = `https://animepahe.si/play/${animeId}/${episodeId}`;
    
    // Fetch episode page with better headers to bypass DDoS protection
    const response = await fetch(episodeUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        // Random realistic User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
      },
      // Disable redirects to handle DDoS page
      redirect: 'manual'
    });
    
    console.log(`Response status: ${response.status}`);
    
    // Check if we got redirected to DDoS protection
    if (response.status === 301 || response.status === 302 || response.status === 403) {
      console.error('Blocked by DDoS protection');
      return res.status(503).json({
        success: false,
        error: 'Blocked by animepahe DDoS protection. Please try again later.',
        status: response.status
      });
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch episode page: ${response.status}`);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch episode page: ${response.status}`
      });
    }
    
    const html = await response.text();
    console.log(`Page size: ${html.length} bytes`);
    
    // Check if page contains DDoS protection
    if (html.includes('DDoS-Guard') || html.includes('Checking your browser')) {
      console.error('DDoS protection detected in response');
      return res.status(503).json({
        success: false,
        error: 'DDoS protection detected. Animepahe is blocking automated requests.'
      });
    }
    
    // Extract video URL from page
    // Look for m3u8 or mp4 URLs in the page
    const videoPatterns = [
      /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
      /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
      /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i,
      /data-src=["']([^"']+\.m3u8[^"']*)["']/i
    ];
    
    let videoUrl = null;
    for (const pattern of videoPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        videoUrl = match[1];
        console.log(`Found video URL: ${videoUrl.substring(0, 50)}...`);
        break;
      }
    }
    
    if (!videoUrl) {
      console.error('No video URL found in page');
      // Return debug info
      const hasPlayer = html.includes('video') || html.includes('player');
      return res.status(404).json({
        success: false,
        error: 'No video sources found. The episode may not be available.',
        debug: {
          videoUrlFound: false,
          pageHasPlayer: hasPlayer,
          pageSize: html.length
        }
      });
    }
    
    // Create proxied URL
    const proxiedUrl = `https://proxy-sigma-ten-63.vercel.app/api?url=${encodeURIComponent(videoUrl)}`;
    
    console.log('Stream extraction successful');
    
    return res.status(200).json({
      success: true,
      data: {
        streamUrl: proxiedUrl,
        originalUrl: videoUrl,
        referer: 'https://animepahe.si/',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        headers: {
          'Referer': 'https://animepahe.si/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        }
      }
    });
    
  } catch (error) {
    console.error('Stream extraction error:', error);
    return res.status(500).json({
      success: false,
      error: `Stream extraction failed: ${error.message}`
    });
  }
}
