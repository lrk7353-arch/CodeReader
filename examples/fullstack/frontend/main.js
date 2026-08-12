export async function loadReviewQueue(fetcher = fetch) {
  const response = await fetcher("/api/reviews");
  if (!response.ok) throw new Error("review queue unavailable");
  return response.json();
}

export function renderReviewQueue(target, reviews) {
  target.textContent = reviews.map((review) => review.title).join(", ");
}

void loadReviewQueue().then((reviews) => renderReviewQueue(document.querySelector("#queue"), reviews));
