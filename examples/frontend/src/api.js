export async function loadActivities(fetcher = fetch) {
  const response = await fetcher("./activities.json");
  if (!response.ok) throw new Error("activity request failed");
  return response.json();
}
