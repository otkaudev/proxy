// api/extract.js
// Extract video URL from Animex.one
// Bypasses Cloudflare and returns direct m3u8 URL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  try {
    console.log('[Extract] Fetching:', url);
    
    // Fetch Animex episode page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://animex.one/'
      }
    });
    
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch page' });
    }
    
    const html = await response.text();
    
    // Look for video URLs
    const patterns = [
      /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
      /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
      /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const videoUrl = match[1];
        console.log('[Extract] Found:', videoUrl.substring(0, 60) + '...');
        
        // Return proxied URL for CORS bypass
        const proxiedUrl = `https://proxy-sigma-ten-63.vercel.app/api?url=${encodeURIComponent(videoUrl)}`;
        
        return res.status(200).json({
          success: true,
          streamUrl: proxiedUrl,
          originalUrl: videoUrl
        });
      }
    }
    
    // Check iframes
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      console.log('[Extract] Found iframe:', iframeMatch[1].substring(0, 50) + '...');
      
      // Fetch iframe content
      const iframeRes = await fetch(iframeMatch[1], {
        headers: { 'Referer': url, 'User-Agent': 'Mozilla/5.0' }
      });
      const iframeHtml = await iframeRes.text();
      
      for (const pattern of patterns) {
        const match = iframeHtml.match(pattern);
        if (match && match[1]) {
          const videoUrl = match[1];
          const proxiedUrl = `https://proxy-sigma-ten-63.vercel.app/api?url=${encodeURIComponent(videoUrl)}`;
          
          return res.status(200).json({
            success: true,
            streamUrl: proxiedUrl,
            originalUrl: videoUrl
          });
        }
      }
    }
    
    return res.status(404).json({ 
      error: 'No video URL found',
      debug: { pageSize: html.length }
    });
    
  } catch (error) {
    console.error('[Extract] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
