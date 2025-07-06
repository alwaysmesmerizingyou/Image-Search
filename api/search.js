import axios from "axios";

export default async function handler(req, res) {
  const q = req.query.q;
  if (!q) return res.status(400).json([]);
  
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iar=images&iax=images&ia=images`;
    const searchResponse = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    const vqdMatch = searchResponse.data.match(/vqd=([\d-]+)/);
    if (!vqdMatch) {
      console.log("Could not find vqd token");
      return res.status(500).json([]);
    }
    
    const vqd = vqdMatch[1];
    
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
    
    const imageResponse = await axios.get(imageApiUrl, {
      params: params,
      headers: {
        "Referer": "https://duckduckgo.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    
    const imageData = imageResponse.data;
    if (!imageData || !imageData.results) {
      console.log("No results found in response");
      return res.status(500).json([]);
    }
    
    const urls = imageData.results.map(result => result.image).filter(url => url);
    
    res.status(200).json(urls);
    
  } catch (error) {
    console.error("Error searching images:", error.message);
    res.status(500).json([]);
  }
}