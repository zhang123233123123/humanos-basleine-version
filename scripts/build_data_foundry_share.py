from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
OUTPUT = ROOT / "data-foundry-share"


def main() -> None:
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    css = (FRONTEND / "styles.css").read_text(encoding="utf-8")
    javascript = (FRONTEND / "app.js").read_text(encoding="utf-8")

    html = re.sub(
        r'<link\s+rel="stylesheet"\s+href="styles\.css[^"]*">',
        lambda _match: f"<style>\n{css}\n</style>",
        html,
        count=1,
    )
    html = re.sub(
        r'<script\s+src="app\.js[^"]*"></script>',
        lambda _match: (
            "<script>\n"
            "const remoteApi = new URLSearchParams(window.location.search).get('api');\n"
            "if (remoteApi) window.HUMANOS_API_BASE = remoteApi.replace(/\\/$/, '');\n"
            "window.HUMANOS_STATIC_SHARE = !window.HUMANOS_API_BASE;\n"
            "</script>\n"
            f"<script>\n{javascript}\n</script>"
        ),
        html,
        count=1,
    )

    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT / "index.html").write_text(html, encoding="utf-8")
    (OUTPUT / "humanos-data-foundry-syy7.html").write_text(html, encoding="utf-8")
    print(OUTPUT / "humanos-data-foundry-syy7.html")


if __name__ == "__main__":
    main()
