let activities = [];

export function replaceActivities(nextActivities) {
  activities = [...nextActivities];
}

export function currentActivities() {
  return [...activities];
}
