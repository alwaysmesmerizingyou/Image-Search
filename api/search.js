export default async function handler(req, res) {
  const q = req.query.q;
  const debug = [];
  
  function addDebug(message, data = null) {
    debug.push({
      timestamp: new Date().toISOString(),
      message: message,
      data: data
    });
  }
  
  if (!q) {
    addDebug("ERROR: No query parameter provided");
    return res.status(400).json({ error: "No query", debug });
  }
  
  addDebug(`Starting search for: "${q}"`);
  
  try {
    // Manual URL encoding to avoid the pattern error
    const encodedQuery = q.replace(/[^a-zA-Z0-9]/g, function(char) {
      return '%' + char.charCodeAt(0).toString(16).toUpperCase();
    });
    
    addDebug(`Manual encoded query: "${encodedQuery}"`);
    
    // Get the full HTML page with images loaded
    const searchUrl = `https://duckduckgo.com/?q=${encodedQuery}&iar=images&iax=images&ia=images`;
    addDebug(`Making request to: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      }
    });
    
    addDebug(`Search response status: ${searchResponse.status}`);
    addDebug(`Search response ok: ${searchResponse.ok}`);
    
    if (!searchResponse.ok) {
      addDebug("Initial request failed");
      return res.status(500).json({ error: "Failed to fetch search page", debug });
    }
    
    const searchText = await searchResponse.text();
    addDebug(`Search response text length: ${searchText.length}`);
    
    // Look for image data in the HTML
    // DuckDuckGo embeds image data in JavaScript variables
    addDebug("Looking for image data in HTML...");
    
    // Try different patterns to find image URLs
    const imagePatterns = [
      // Look for thumbnail URLs in the HTML
      /https:\/\/external-content\.duckduckgo\.com\/iu\/\?u=([^&"']+)/g,
      // Look for direct image URLs
      /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|gif|webp)/gi,
      // Look for data-src attributes
      /data-src="([^"]+)"/g,
      // Look for src attributes in img tags
      /<img[^>]+src="([^"]+)"/g
    ];
    
    let foundUrls = new Set();
    
    for (let i = 0; i < imagePatterns.length; i++) {
      const pattern = imagePatterns[i];
      const matches = [...searchText.matchAll(pattern)];
      addDebug(`Pattern ${i} found ${matches.length} matches`);
      
      matches.forEach(match => {
        let url = match[1] || match[0];
        if (url.startsWith('https://external-content.duckduckgo.com/iu/?u=')) {
          // Extract the actual image URL from DuckDuckGo's proxy
          const actualUrl = decodeURIComponent(url.split('u=')[1].split('&')[0]);
          foundUrls.add(actualUrl);
        } else if (url.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
          foundUrls.add(url);
        }
      });
    }
    
    addDebug(`Found ${foundUrls.size} unique image URLs`);
    
    // Convert to array and limit results
    const urls = Array.from(foundUrls).slice(0, 20);
    addDebug(`Final URLs (limited to 20):`, urls);
    
    if (urls.length === 0) {
      // If no images found, look for any JSON data in the page
      const jsonMatches = searchText.match(/DDG\.pageLayout\.load\('images',(\{.*?\})\);/);
      if (jsonMatches) {
        addDebug("Found JSON data in page layout");
        try {
          const jsonData = JSON.parse(jsonMatches[1]);
          addDebug("Parsed JSON data:", jsonData);
          
          if (jsonData.results) {
            const jsonUrls = jsonData.results.map(r => r.image).filter(url => url);
            addDebug(`Extracted ${jsonUrls.length} URLs from JSON`);
            return res.status(200).json({ images: jsonUrls, debug });
          }
        } catch (e) {
          addDebug(`Failed to parse JSON: ${e.message}`);
        }
      }
      
      // Show some of the HTML content for debugging
      addDebug("No images found. HTML sample:", searchText.substring(0, 2000));
      return res.status(200).json({ images: [], debug, message: "No images found" });
    }
    
    res.status(200).json({ images: urls, debug });
    
  } catch (error) {
    addDebug(`ERROR: ${error.message}`);
    addDebug(`ERROR name: ${error.name}`);
    addDebug(`ERROR stack:`, error.stack);
    res.status(500).json({ error: error.message, debug });
  }
}