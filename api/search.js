import axios from "axios";

export default async function handler(req, res) {
  const q = req.query.q;
  const searchParams = new URLSearchParams({ q, iax: "images", ia: "images" });

  try {
    const html = await axios.get("https://duckduckgo.com/?" + searchParams);
    const vqdMatch = html.data.match(/vqd='([^']+)'/);
    if (!vqdMatch) return res.status(500).json([]);

    const vqd = vqdMatch[1];
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}`;
    const images = await axios.get(imgUrl, {
      headers: {
        "Referer": "https://duckduckgo.com/",
        "User-Agent": "Mozilla/5.0"
      }
    });

    const urls = images.data.results.map(r => r.image);
    res.status(200).json(urls);
  } catch {
    res.status(500).json([]);
  }
}
