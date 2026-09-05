module.exports = async (req, res) => {
  try {
    const token = process.env.NOTION_TOKEN;
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: { value: "database", property: "object" },
      }),
    });
    const data = await response.json();
    const simplified = (data.results || []).map((db) => ({
      id: db.id,
      title: db.title?.map((t) => t.plain_text).join("") || "(untitled)",
    }));
    res.status(200).json({ accessibleDatabases: simplified, raw: data });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
