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
    console.log(`Animex.one: "${animeId}" Episode ${episodeNum}`);
    
    // Step 1: Search for anime
    const searchUrl = `https://animex.one/search?keyword=${encodeURIComponent(animeId)}`;
    console.log(`Searching: ${searchUrl}`);
    
    const searchRes = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://animex.one/'
      }
    });
    
    if (!searchRes.ok) {
      return res.status(500).json({ success: false, error: `Search failed: ${searchRes.status}` });
    }
    
    const searchHtml = await searchRes.text();
    console.log(`Search results: ${searchHtml.length} bytes`);
    
    // Extract anime URL - try multiple patterns
    const patterns = [
      /href=["']\/anime\/([^"']+)["']/i,
      /href=["'](https:\/\/animex\.one\/anime\/[^"']+)["']/i
    ];
    
    let animeSlug = null;
    for (const pattern of patterns) {
      const match = searchHtml.match(pattern);
      if (match) {
        animeSlug = match[1];
        console.log(`Found slug: ${animeSlug}`);
        break;
      }
    }
    
    if (!animeSlug) {
      return res.status(404).json({ 
        success: false, 
        error: 'Anime not found. Try a different search term.',
        debug: { searched: animeId, pageSize: searchHtml.length }
      });
    }
    
    // Step 2: Fetch anime page
    const animeUrl = `https://animex.one/anime/${animeSlug}`;
    console.log(`Anime page: ${animeUrl}`);
    
    const animeRes = await fetch(animeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const animeHtml = await animeRes.text();
    
    // Step 3: Find episode link
    const epPatterns = [
      new RegExp(`href=["']\/episode\\/([^"']*${episodeNum}[^"']*)["']`, 'i'),
      new RegExp(`href=["']\/watch\\/([^"']*${episodeNum}[^"']*)["']`, 'i'),
      /href=["']\/episode\/([^"']+)["']/gi
    ];
    
    let episodeSlug = null;
    for (const pattern of epPatterns) {
      const matches = pattern.exec(animeHtml);
      if (matches) {
        episodeSlug = matches[1];
        console.log(`Found episode: ${episodeSlug}`);
        break;
      }
    }
    
    if (!episodeSlug) {
      return res.status(404).json({ success: false, error: `Episode ${episodeNum} not found` });
    }
    
    const epUrl = `https://animex.one/episode/${episodeSlug}`;
    console.log(`Episode page: ${epUrl}`);
    
    // Step 4: Fetch episode page
    const epRes = await fetch(epUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://animex.one/'
      } 
    });
    const epHtml = await epRes.text();
    
    // Step 5: Extract video URL
    const videoPatterns = [
      /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
      /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
      /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i,
      /data-url=["']([^"']+\.m3u8[^"']*)["']/i
    ];
    
    let videoUrl = null;
    for (const pattern of videoPatterns) {
      const match = epHtml.match(pattern);
      if (match && match[1]) {
        videoUrl = match[1];
        console.log(`Found video: ${videoUrl.substring(0, 60)}...`);
        break;
      }
    }
    
    if (!videoUrl) {
      return res.status(404).json({ 
        success: false, 
        error: 'No video sources found',
        debug: { episodePage: epUrl, pageSize: epHtml.length }
      });
    }
    
    // Create proxied URL
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
