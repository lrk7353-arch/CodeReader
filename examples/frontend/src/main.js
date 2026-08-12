import { loadActivities } from "./api.js";
import { currentActivities, replaceActivities } from "./store.js";
import { renderActivities } from "./view.js";

export async function startActivityBoard(target = document.querySelector("#app")) {
  if (!target) throw new Error("application root is missing");
  replaceActivities(await loadActivities());
  renderActivities(target, currentActivities());
}

void startActivityBoard();
