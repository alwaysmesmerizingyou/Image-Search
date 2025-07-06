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
    
    // Construct URL manually
    const searchUrl = `https://duckduckgo.com/?q=${encodedQuery}&iar=images&iax=images&ia=images`;
    addDebug(`Making initial request to: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    
    addDebug(`Search response status: ${searchResponse.status}`);
    addDebug(`Search response ok: ${searchResponse.ok}`);
    
    const searchText = await searchResponse.text();
    addDebug(`Search response text length: ${searchText.length}`);
    addDebug(`First 1000 chars of response:`, searchText.substring(0, 1000));
    
    // Try multiple vqd extraction patterns
    const vqdPatterns = [
      /vqd=([\d-]+)/,
      /vqd=['"]([^'"]+)['"]/,
      /"vqd"\s*:\s*"([^"]+)"/,
      /vqd:\s*'([^']+)'/,
      /vqd:\s*"([^"]+)"/,
      /vqd['":\s=]+([\d-]+)/,
      /"vqd":"([^"]+)"/
    ];
    
    let vqd = null;
    for (let i = 0; i < vqdPatterns.length; i++) {
      const match = searchText.match(vqdPatterns[i]);
      if (match) {
        vqd = match[1];
        addDebug(`Found vqd token with pattern ${i}: ${vqd}`);
        break;
      }
    }
    
    if (!vqd) {
      addDebug("Could not find vqd token with any pattern");
      // Look for any occurrence of 'vqd' in the response
      const vqdMatches = searchText.match(/vqd/gi);
      addDebug(`Found ${vqdMatches ? vqdMatches.length : 0} 'vqd' occurrences`);
      
      // Show context around vqd occurrences
      const vqdIndex = searchText.indexOf('vqd');
      if (vqdIndex !== -1) {
        const context = searchText.substring(Math.max(0, vqdIndex - 100), vqdIndex + 200);
        addDebug(`Context around first 'vqd':`, context);
      }
      
      return res.status(500).json({ error: "Could not find vqd token", debug });
    }
    
    addDebug(`Using vqd token: ${vqd}`);
    
    // Build image API URL manually
    const imageApiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodedQuery}&vqd=${vqd}&f=,,,&p=1&v7exp=a`;
    addDebug(`Making image API request to: ${imageApiUrl}`);
    
    const imageResponse = await fetch(imageApiUrl, {
      method: 'GET',
      headers: {
        "Referer": "https://duckduckgo.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.5",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    
    addDebug(`Image API response status: ${imageResponse.status}`);
    addDebug(`Image API response ok: ${imageResponse.ok}`);
    
    const imageText = await imageResponse.text();
    addDebug(`Image API response text length: ${imageText.length}`);
    addDebug(`Image API raw response:`, imageText);
    
    // Try to parse as JSON
    let imageData;
    try {
      imageData = JSON.parse(imageText);
      addDebug("Successfully parsed JSON response");
    } catch (parseError) {
      addDebug(`JSON parse error: ${parseError.message}`);
      addDebug(`Response was not valid JSON:`, imageText);
      return res.status(500).json({ error: "Invalid JSON response", debug });
    }
    
    if (!imageData) {
      addDebug("No image data received after parsing");
      return res.status(500).json({ error: "No image data", debug });
    }
    
    addDebug("Image data structure:", Object.keys(imageData));
    
    if (!imageData.results) {
      addDebug("No results array in image data");
      return res.status(500).json({ error: "No results array", debug, imageData });
    }
    
    addDebug(`Found ${imageData.results.length} image results`);
    
    const urls = imageData.results.map((result, index) => {
      addDebug(`Result ${index}:`, result);
      return result.image;
    }).filter(url => url);
    
    addDebug(`Filtered to ${urls.length} valid URLs`);
    addDebug(`Final URLs:`, urls);
    
    res.status(200).json({ images: urls, debug });
    
  } catch (error) {
    addDebug(`ERROR: ${error.message}`);
    addDebug(`ERROR name: ${error.name}`);
    addDebug(`ERROR stack:`, error.stack);
    res.status(500).json({ error: error.message, debug });
  }
}