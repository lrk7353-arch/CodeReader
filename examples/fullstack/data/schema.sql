CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete'))
);

CREATE INDEX reviews_status_idx ON reviews (status);
