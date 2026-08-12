import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from backend.service import list_pending_reviews


class ReviewHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/api/reviews":
            self.send_error(404)
            return
        payload = json.dumps(list_pending_reviews()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def run(port=8080):
    HTTPServer(("127.0.0.1", port), ReviewHandler).serve_forever()


if __name__ == "__main__":
    run()
