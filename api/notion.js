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

function getTitle(page, propName) {
  const prop = page.properties[propName];
  if (!prop || !prop.title || prop.title.length === 0) return "";
  return prop.title.map((t) => t.plain_text).join("");
}

function getRelationIds(page, propName) {
  const prop = page.properties[propName];
  return prop && prop.relation ? prop.relation.map((r) => r.id) : [];
}

function getStatusOrSelect(page, propName) {
  const prop = page.properties[propName];
  if (!prop) return null;
  if (prop.status) return prop.status.name;
  if (prop.select) return prop.select.name;
  return null;
}

function daysSince(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

module.exports = async (req, res) => {
  try {
    const token = process.env.NOTION_TOKEN;
    const dbBranches = process.env.DB_BRANCHES;
    const dbQuests = process.env.DB_QUESTS;
    const dbSteps = process.env.DB_STEPS;

    if (!token || !dbBranches || !dbQuests || !dbSteps) {
      res.status(500).json({ error: "Missing environment variables." });
      return;
    }

    const [branchPages, questPages, stepPages] = await Promise.all([
      queryDatabase(dbBranches, token),
      queryDatabase(dbQuests, token),
      queryDatabase(dbSteps, token),
    ]);

    const stepsByQuest = {};
    for (const page of stepPages) {
      const step = {
        id: page.id,
        name: getTitle(page, "Step"),
        leafStage: getStatusOrSelect(page, "Leaf stage"),
        lastEdited: page.last_edited_time,
      };
      for (const qid of getRelationIds(page, "Quest")) {
        (stepsByQuest[qid] ||= []).push(step);
      }
    }

    const questsByBranch = {};
    for (const page of questPages) {
      const quest = {
        id: page.id,
        name: getTitle(page, "Quest"),
        leafStage: getStatusOrSelect(page, "Leaf stage"),
        lastEdited: page.last_edited_time,
        steps: stepsByQuest[page.id] || [],
      };
      for (const bid of getRelationIds(page, "Branch")) {
        (questsByBranch[bid] ||= []).push(quest);
      }
    }

    const branches = branchPages.map((page) => {
      const quests = questsByBranch[page.id] || [];
      let minDays = daysSince(page.last_edited_time);
      let lastTended = page.last_edited_time;
      for (const q of quests) {
        if (daysSince(q.lastEdited) < minDays) { minDays = daysSince(q.lastEdited); lastTended = q.lastEdited; }
        for (const s of q.steps) {
          if (daysSince(s.lastEdited) < minDays) { minDays = daysSince(s.lastEdited); lastTended = s.lastEdited; }
        }
      }
      return {
        id: page.id,
        name: getTitle(page, "Branch"),
        health: minDays > 14 ? "needs_watering" : "alive",
        lastTended,
        quests,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ branches, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
