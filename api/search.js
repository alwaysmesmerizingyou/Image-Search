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
  const google_api_key = process.env.google_api_key;
  const google_search_engine_id = process.env.google_search_engine_id;
  
  if (!google_api_key || !google_search_engine_id) {
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
          "5. Add environment variables: google_api_key and google_search_engine_id"
        ]
      }
    });
  }
  
  try {
    // Build Google Custom Search API URL
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.append('key', google_api_key);
searchUrl.searchParams.append('cx', google_search_engine_id);
searchUrl.searchParams.append('q', q);
searchUrl.searchParams.append('searchType', 'image');

// Use max allowed (10), not 1000
searchUrl.searchParams.append('num', '10');

// Disable SafeSearch
searchUrl.searchParams.append('safe', 'off');

// Allow all file types (omit fileType)
searchUrl.searchParams.delete('fileType');

// Allow all image sizes (omit imgSize)
searchUrl.searchParams.delete('imgSize');

// Optionally broaden more:
searchUrl.searchParams.append('imgType', 'photo');
searchUrl.searchParams.append('rights', 'cc_publicdomain,cc_attribute,cc_sharealike,cc_noncommercial');
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