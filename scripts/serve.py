#!/usr/bin/env python3
"""Local preview server with HTTP Range support (the map's .pmtiles files are read with
range requests; `python3 -m http.server` does not support them).
usage: python3 scripts/serve.py [port]      then open http://localhost:8000
"""
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import http.server, os, re, sys
class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        m = re.match(r'bytes=(\d*)-(\d*)', rng)
        size = os.path.getsize(path)
        s = int(m.group(1)) if m.group(1) else size - int(m.group(2))
        e = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        e = min(e, size - 1)
        f = open(path, 'rb'); f.seek(s)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {s}-{e}/{size}')
        self.send_header('Content-Length', str(e - s + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self._len = e - s + 1
        return f
    def copyfile(self, src, dst):
        n = getattr(self, '_len', None)
        if n is None: return super().copyfile(src, dst)
        while n > 0:
            b = src.read(min(65536, n))
            if not b: break
            dst.write(b); n -= len(b)
        self._len = None
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print('TEKUMA preview: http://localhost:%d' % port)
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
