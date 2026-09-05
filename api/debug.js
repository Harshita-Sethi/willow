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
        filter: { value: "data_source", property: "object" },
      }),
    });
    const data = await response.json();
    const simplified = (data.results || []).map((ds) => ({
      id: ds.id,
      title: ds.title?.map((t) => t.plain_text).join("") || "(untitled)",
      parent_database_id: ds.parent?.database_id || null,
    }));
    res.status(200).json({ accessibleDataSources: simplified, raw: data });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
