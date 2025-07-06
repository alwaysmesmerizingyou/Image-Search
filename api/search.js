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
    // Better URL encoding
    const encodedQuery = encodeURIComponent(q);
    addDebug(`Encoded query: "${encodedQuery}"`);
    
    // Try DuckDuckGo's instant answer API first
    const instantAnswerUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    addDebug(`Trying instant answer API: ${instantAnswerUrl}`);
    
    try {
      const instantResponse = await fetch(instantAnswerUrl, {
        method: 'GET',
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ImageSearchBot/1.0)",
          "Accept": "application/json"
        }
      });
      
      if (instantResponse.ok) {
        const instantData = await instantResponse.json();
        addDebug("Instant answer API response received");
        
        // Extract images from instant answer
        const images = [];
        if (instantData.Image) images.push(instantData.Image);
        if (instantData.RelatedTopics) {
          instantData.RelatedTopics.forEach(topic => {
            if (topic.Icon && topic.Icon.URL) {
              images.push(topic.Icon.URL);
            }
          });
        }
        
        if (images.length > 0) {
          addDebug(`Found ${images.length} images from instant answer`);
          return res.status(200).json({ images, debug });
        }
      }
    } catch (e) {
      addDebug(`Instant answer API failed: ${e.message}`);
    }
    
    // Fallback to web scraping with improved approach
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
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none"
      }
    });
    
    addDebug(`Search response status: ${searchResponse.status}`);
    
    if (!searchResponse.ok) {
      addDebug("Search request failed");
      return res.status(500).json({ error: "Failed to fetch search page", debug });
    }
    
    const searchText = await searchResponse.text();
    addDebug(`Search response text length: ${searchText.length}`);
    
    // Look for the vqd token which is needed for image requests
    const vqdMatch = searchText.match(/vqd=['"]([^'"]+)['"]/);
    if (vqdMatch) {
      const vqd = vqdMatch[1];
      addDebug(`Found vqd token: ${vqd}`);
      
      // Make a request to the images endpoint
      const imagesUrl = `https://duckduckgo.com/i.js?q=${encodedQuery}&o=json&p=1&s=0&u=bing&f=,,,&l=us-en&vqd=${vqd}`;
      addDebug(`Making images API request: ${imagesUrl}`);
      
      const imagesResponse = await fetch(imagesUrl, {
        method: 'GET',
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Referer": searchUrl,
          "Accept-Language": "en-US,en;q=0.5"
        }
      });
      
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        addDebug(`Images API response received`);
        
        if (imagesData.results && imagesData.results.length > 0) {
          const imageUrls = imagesData.results.map(result => result.image).filter(url => url);
          addDebug(`Found ${imageUrls.length} image URLs from API`);
          return res.status(200).json({ images: imageUrls.slice(0, 20), debug });
        }
      } else {
        addDebug(`Images API request failed: ${imagesResponse.status}`);
      }
    }
    
    // Enhanced HTML parsing as final fallback
    addDebug("Trying enhanced HTML parsing...");
    
    const imagePatterns = [
      // DuckDuckGo proxy URLs
      /https:\/\/external-content\.duckduckgo\.com\/iu\/\?u=([^&"'>\s]+)/g,
      // Direct image URLs
      /https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?[^"'\s<>]*)?/gi,
      // Data URLs for images
      /data-src=["']([^"']+)["']/g,
      // Background images
      /background-image:\s*url\(["']?([^"')]+)["']?\)/g,
      // JSON embedded in script tags
      /"image":"([^"]+)"/g,
      // Thumbnail URLs
      /"thumb":"([^"]+)"/g
    ];
    
    let foundUrls = new Set();
    
    imagePatterns.forEach((pattern, index) => {
      const matches = [...searchText.matchAll(pattern)];
      addDebug(`Pattern ${index} found ${matches.length} matches`);
      
      matches.forEach(match => {
        let url = match[1] || match[0];
        
        // Handle DuckDuckGo proxy URLs
        if (url.includes('external-content.duckduckgo.com/iu/?u=')) {
          try {
            const actualUrl = decodeURIComponent(url.split('u=')[1].split('&')[0]);
            if (actualUrl.startsWith('http')) {
              foundUrls.add(actualUrl);
            }
          } catch (e) {
            addDebug(`Failed to decode proxy URL: ${url}`);
          }
        } else if (url.startsWith('http') && /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)) {
          foundUrls.add(url);
        }
      });
    });
    
    // Also try to find JavaScript data
    const jsDataMatches = searchText.match(/DDG\.pageLayout\.load\('images',\s*(\{.*?\})\);/s);
    if (jsDataMatches) {
      try {
        const jsonData = JSON.parse(jsDataMatches[1]);
        addDebug("Found and parsed JavaScript data");
        
        if (jsonData.results) {
          jsonData.results.forEach(result => {
            if (result.image) foundUrls.add(result.image);
            if (result.thumbnail) foundUrls.add(result.thumbnail);
          });
        }
      } catch (e) {
        addDebug(`Failed to parse JavaScript data: ${e.message}`);
      }
    }
    
    const urls = Array.from(foundUrls).slice(0, 20);
    addDebug(`Final result: ${urls.length} unique image URLs`);
    
    if (urls.length === 0) {
      // Show HTML sample for debugging
      addDebug("No images found. HTML sample:", searchText.substring(0, 1000));
      return res.status(200).json({ 
        images: [], 
        debug, 
        message: "No images found. DuckDuckGo may be blocking or the query returned no results.",
        suggestions: [
          "Try a different search query",
          "Use a different image search service",
          "Check if your IP is being rate-limited"
        ]
      });
    }
    
    res.status(200).json({ images: urls, debug });
    
  } catch (error) {
    addDebug(`ERROR: ${error.message}`);
    addDebug(`ERROR stack:`, error.stack);
    res.status(500).json({ error: error.message, debug });
  }
}