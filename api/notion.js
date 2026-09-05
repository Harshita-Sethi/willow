const NOTION_VERSION = "2025-09-03";

async function getDataSourceId(databaseId, token) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`Notion API error fetching database ${databaseId}: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  if (!data.data_sources || data.data_sources.length === 0) {
    throw new Error(`No data sources found for database ${databaseId}`);
  }
  return data.data_sources[0].id;
}

async function queryDatabase(databaseId, token) {
  const dataSourceId = await getDataSourceId(databaseId, token);
  let results = [];
  let cursor;
  do {
    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
      }
    );
    if (!response.ok) {
      throw new Error(`Notion API error (${databaseId}): ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}
