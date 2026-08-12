export function renderActivities(target, activities) {
  target.replaceChildren(
    ...activities.map((activity) => {
      const item = document.createElement("p");
      item.textContent = activity.title;
      return item;
    })
  );
}
