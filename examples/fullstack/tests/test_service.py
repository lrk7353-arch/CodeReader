import unittest
from unittest.mock import patch

from backend.service import list_pending_reviews


class ReviewServiceTest(unittest.TestCase):
    @patch("backend.service.fetch_pending_reviews", return_value=[(1, "Check explanation", "pending")])
    def test_maps_repository_rows(self, _fetch):
        self.assertEqual(
            list_pending_reviews(),
            [{"id": 1, "title": "Check explanation", "status": "pending"}],
        )
