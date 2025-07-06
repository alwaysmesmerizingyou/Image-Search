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
  
  addDebug(`Starting Google image search for: "${q}"`);
  
  // Google Custom Search API credentials
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    addDebug("ERROR: Missing Google API credentials");
    return res.status(500).json({ 
      error: "Missing Google API credentials", 
      debug,
      setup: {
        message: "You need to set up Google Custom Search API",
        steps: [
          "1. Go to Google Cloud Console",
          "2. Enable Custom Search API",
          "3. Create API key",
          "4. Set up Custom Search Engine at https://cse.google.com/",
          "5. Add environment variables: GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID"
        ]
      }
    });
  }
  
  try {
    // Build Google Custom Search API URL
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.append('key', GOOGLE_API_KEY);
    searchUrl.searchParams.append('cx', GOOGLE_SEARCH_ENGINE_ID);
    searchUrl.searchParams.append('q', q);
    searchUrl.searchParams.append('searchType', 'image');
    searchUrl.searchParams.append('num', '10'); // Max 10 results per request
    searchUrl.searchParams.append('safe', 'active');
    searchUrl.searchParams.append('fileType', 'jpg,png,gif,webp');
    searchUrl.searchParams.append('imgSize', 'medium');
    
    addDebug(`Making request to Google Custom Search API`);
    
    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ImageSearchAPI/1.0'
      }
    });
    
    addDebug(`Google API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      addDebug(`Google API error: ${errorText}`);
      return res.status(response.status).json({ 
        error: `Google API error: ${response.status}`, 
        debug,
        details: errorText
      });
    }
    
    const data = await response.json();
    addDebug(`Google API response received`);
    
    if (data.error) {
      addDebug(`Google API returned error: ${data.error.message}`);
      return res.status(400).json({ 
        error: data.error.message, 
        debug,
        errorDetails: data.error
      });
    }
    
    if (!data.items || data.items.length === 0) {
      addDebug("No images found in Google search results");
      return res.status(200).json({ 
        images: [], 
        debug,
        message: "No images found for this query"
      });
    }
    
    // Extract image URLs and metadata
    const images = data.items.map(item => ({
      url: item.link,
      title: item.title,
      snippet: item.snippet,
      thumbnail: item.image?.thumbnailLink,
      contextLink: item.image?.contextLink,
      width: item.image?.width,
      height: item.image?.height,
      size: item.image?.byteSize,
      fileFormat: item.fileFormat
    }));
    
    addDebug(`Successfully extracted ${images.length} images`);
    
    // Return both simple URL array and detailed metadata
    const imageUrls = images.map(img => img.url);
    
    res.status(200).json({ 
      images: imageUrls,
      detailedResults: images,
      searchInformation: {
        searchTime: data.searchInformation?.searchTime,
        totalResults: data.searchInformation?.totalResults,
        formattedTotalResults: data.searchInformation?.formattedTotalResults
      },
      debug 
    });
    
  } catch (error) {
    addDebug(`ERROR: ${error.message}`);
    addDebug(`ERROR stack:`, error.stack);
    res.status(500).json({ error: error.message, debug });
  }
}