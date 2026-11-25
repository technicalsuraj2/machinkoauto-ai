import sys
import json
import urllib.request
import urllib.parse
import http.server
import socketserver
import subprocess

FIREBASE_URL = "https://ai-agent-24af3-default-rtdb.firebaseio.com"

def run_oauth_server(client_id: str, client_secret: str, expected_channel_id: str = "", port: int = 8080, path: str = ""):
    redirect_uri = f"http://localhost:{port}{path}"

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if "code" not in params:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Missing authorization code.")
                return

            code = params["code"][0]
            try:
                # 1. Exchange code for tokens
                token_url = "https://oauth2.googleapis.com/token"
                data = urllib.parse.urlencode({
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code"
                }).encode("utf-8")
                req = urllib.request.Request(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
                with urllib.request.urlopen(req, timeout=15) as res:
                    tokens = json.loads(res.read().decode("utf-8"))

                access_token = tokens.get("access_token")
                refresh_token = tokens.get("refresh_token")

                if not refresh_token:
                    raise RuntimeError("No refresh_token returned! Make sure prompt=consent is used.")

                # 2. Fetch YouTube Channel Info
                ch_url = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
                ch_req = urllib.request.Request(ch_url, headers={"Authorization": f"Bearer {access_token}"})
                with urllib.request.urlopen(ch_req, timeout=10) as ch_res:
                    ch_data = json.loads(ch_res.read().decode("utf-8"))

                items = ch_data.get("items", [])
                ch_id = expected_channel_id
                ch_name = "YouTube Channel"
                if items:
                    ch_id = items[0]["id"]
                    ch_name = items[0]["snippet"]["title"]

                # 3. Save to Firebase
                fb_url = f"{FIREBASE_URL}/channels/{ch_id}.json"
                payload = {
                    "channelId": ch_id,
                    "channelName": ch_name,
                    "clientId": client_id,
                    "clientSecret": client_secret,
                    "refreshToken": refresh_token,
                    "status": "connected"
                }
                fb_req = urllib.request.Request(
                    fb_url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="PATCH"
                )
                urllib.request.urlopen(fb_req, timeout=10)

                print(json.dumps({
                    "status": "success",
                    "channelId": ch_id,
                    "channelName": ch_name,
                    "hasRefreshToken": True
                }))

                # 4. If GTA6-INDIA, also sync GitHub secret YOUTUBE_REFRESH_TOKEN
                if ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
                    try:
                        subprocess.run(["gh", "secret", "set", "YOUTUBE_REFRESH_TOKEN", "--body", refresh_token], check=False)
                    except Exception:
                        pass

                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                html = f"<h2>Connected: {ch_name} ({ch_id})!</h2><p>Refresh token saved to Firebase with dedicated Google Cloud Project quota. You can close this window.</p>"
                self.wfile.write(html.encode("utf-8"))
                raise SystemExit(0)

            except SystemExit:
                raise
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"Error: {e}".encode("utf-8"))
                print(json.dumps({"status": "error", "error": str(e)}))

        def log_message(self, format, *args):
            pass

    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"Listening on {redirect_uri} for OAuth callback...")
        try:
            httpd.serve_forever()
        except SystemExit:
            pass

if __name__ == "__main__":
    cid = sys.argv[1]
    csec = sys.argv[2]
    exp_ch = sys.argv[3] if len(sys.argv) > 3 else ""
    port = int(sys.argv[4]) if len(sys.argv) > 4 else 8080
    path = sys.argv[5] if len(sys.argv) > 5 else ""
    run_oauth_server(cid, csec, exp_ch, port, path)
