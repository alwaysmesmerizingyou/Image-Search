import axios from "axios";

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
    // First, get the search page to extract the vqd token
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iar=images&iax=images&ia=images`;
    addDebug(`Making initial request to: ${searchUrl}`);
    
    const searchResponse = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      timeout: 10000
    });
    
    addDebug(`Search response status: ${searchResponse.status}`);
    addDebug(`Search response headers:`, searchResponse.headers);
    addDebug(`Search response data length: ${searchResponse.data.length}`);
    
    // Show first 1000 characters of response
    addDebug(`First 1000 chars of response:`, searchResponse.data.substring(0, 1000));
    
    // Try multiple vqd extraction patterns
    const vqdPatterns = [
      /vqd=([\d-]+)/,
      /vqd=['"]([^'"]+)['"]/,
      /"vqd"\s*:\s*"([^"]+)"/,
      /vqd:\s*'([^']+)'/,
      /vqd:\s*"([^"]+)"/
    ];
    
    let vqd = null;
    for (let i = 0; i < vqdPatterns.length; i++) {
      const match = searchResponse.data.match(vqdPatterns[i]);
      if (match) {
        vqd = match[1];
        addDebug(`Found vqd token with pattern ${i}: ${vqd}`);
        break;
      }
    }
    
    if (!vqd) {
      addDebug("Could not find vqd token with any pattern");
      // Look for any occurrence of 'vqd' in the response
      const vqdOccurrences = searchResponse.data.match(/vqd[^a-zA-Z0-9]/gi);
      addDebug(`Found 'vqd' occurrences:`, vqdOccurrences);
      
      // Show context around vqd occurrences
      const vqdIndex = searchResponse.data.indexOf('vqd');
      if (vqdIndex !== -1) {
        const context = searchResponse.data.substring(Math.max(0, vqdIndex - 100), vqdIndex + 200);
        addDebug(`Context around first 'vqd':`, context);
      }
      
      return res.status(500).json({ error: "Could not find vqd token", debug });
    }
    
    addDebug(`Using vqd token: ${vqd}`);
    
    // Now make the API call to get images
    const imageApiUrl = `https://duckduckgo.com/i.js`;
    const params = {
      l: 'us-en',
      o: 'json',
      q: q,
      vqd: vqd,
      f: ',,,',
      p: '1',
      v7exp: 'a'
    };
    
    addDebug(`Making image API request to: ${imageApiUrl}`);
    addDebug(`Image API params:`, params);
    
    const imageResponse = await axios.get(imageApiUrl, {
      params: params,
      headers: {
        "Referer": "https://duckduckgo.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "X-Requested-With": "XMLHttpRequest"
      },
      timeout: 10000
    });
    
    addDebug(`Image API response status: ${imageResponse.status}`);
    addDebug(`Image API response headers:`, imageResponse.headers);
    addDebug(`Image API raw response:`, imageResponse.data);
    
    // Extract image URLs from response
    const imageData = imageResponse.data;
    if (!imageData) {
      addDebug("No image data received");
      return res.status(500).json({ error: "No image data", debug });
    }
    
    if (!imageData.results) {
      addDebug("No results array in image data");
      addDebug("Image data structure:", Object.keys(imageData));
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
    addDebug(`ERROR stack:`, error.stack);
    addDebug(`ERROR response:`, error.response?.data);
    addDebug(`ERROR status:`, error.response?.status);
    res.status(500).json({ error: error.message, debug });
  }
}