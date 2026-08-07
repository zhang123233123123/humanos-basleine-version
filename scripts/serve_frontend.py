from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


ROOT = Path(__file__).resolve().parents[1] / "frontend"


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


def main() -> None:
    os.chdir(ROOT)
    ThreadingHTTPServer(("127.0.0.1", 8766), QuietStaticHandler).serve_forever()


if __name__ == "__main__":
    main()
